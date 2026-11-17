// Optional DSH integration acceptance. No external network and no paid calls.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.hostname==='127.0.0.1')return nativeFetch(input,init);
  if(url.href==='https://api.deepseek.com/chat/completions'){
    const body=JSON.parse(init.body);
    const {questions}=JSON.parse(body.messages.at(-1).content);
    const answers=Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,q.type==='noul'?{noul:0}:q.type==='score'?{score:0}:{choice:Object.keys(q.criteria)[0],confidence:1}]));
    return Response.json({model:'fixed-local-acceptance',choices:[{message:{content:JSON.stringify({answers})}}],usage:{prompt_tokens:0,completion_tokens:0}});
  }
  throw Error('External network disabled in free DSH smoke');
};
