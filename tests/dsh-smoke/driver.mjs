import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {restoreLines} from '../../packages/dsh-sieve/lib/features/line-templates.js';
const require=createRequire(pathToFileURL(process.env.DSH_CLI));
const {LlmAdapter,ToolCallId}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href);
class Driver extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:id,reasoning:{efforts:[{id:'off',name:'Off'}],defaultEffort:'off'}}}
  async *stream(options){
    const result=options.messages.find(m=>m.role==='tool');
    let block;
    if(!result)block={type:'tool-call',id:ToolCallId('smoke-native-read'),name:'read',arguments:JSON.stringify({file_path:'evidence.txt'})};
    else{
      const text=result.content.filter(b=>b.type==='text').map(b=>b.text).join('');
      const encoded=text.split('\n').find(line=>line.startsWith('{"templates":'));
      const source=fs.readFileSync('evidence.txt','utf8').replace(/\n$/,'');
      if(result.isError||!encoded||restoreLines(JSON.parse(encoded)).join('\n')!==source)throw Error('Native G application or reconstruction failed');
      const pointer=/\[sieve: full output: ([^\]\n]+)\]/.exec(text);
      const archive=pointer&&fs.readFileSync(pointer[1],'utf8');
      if(!archive||!source.split('\n').every((line,i)=>archive.includes(`${i+1}: ${line}\n`)))throw Error('Incomplete original archive');
      const verification={free:true,network:'external blocked',features:process.env.SIEVE_LAB_FEATURES,templatesApplied:true,restoredExactly:true,completeArchive:true};
      fs.writeFileSync(process.env.SIEVE_SMOKE_RESULT,JSON.stringify(verification,null,2));
      block={type:'text',text:JSON.stringify(verification)};
    }
    yield {type:'block-start',index:0,blockType:block.type};yield {type:'block-end',index:0,block};yield {type:'usage',usage:{inputTokens:0,outputTokens:0}};yield {type:'finish',reason:{kind:result?'stop':'tool-calls'}};
  }
}
export const name='abcdg-free-dsh-smoke';export const inject=['llm','sieve'];
export function apply(ctx){
  if(process.env.SIEVE_LAB_FEATURES!=='A,B,C,D,G'||ctx.sieve.config.judge.type!=='system-one'||ctx.sieve.config.checkpoint.enabled)throw Error('ABCDG configuration failed');
  ctx.llm.registerAdapter(['deepseek-official'],new Driver());
}
