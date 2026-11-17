"""One local offline request. The parent enforces timeout, archiving and exact-field guards."""
import os, sys, json, contextlib, socket
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
os.environ['HF_HOME'] = r'D:\work\DSH-Sieve\tools\hf-cache'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
def refuse_network(*args, **kwargs):
    raise RuntimeError('Network disabled in the local compressor')
socket.socket.connect = refuse_network
socket.socket.connect_ex = refuse_network
request = json.load(sys.stdin)
if not isinstance(request.get('text'), str) or not 6000 <= len(request['text']) <= 45000 or request.get('rate') != .5:
    raise ValueError('Invalid local compression request')
with contextlib.redirect_stdout(sys.stderr):
    import torch
    from llmlingua import PromptCompressor
    torch.set_num_threads(4)
    model = r'D:\work\DSH-Sieve\tools\hf-cache\hub\models--microsoft--llmlingua-2-bert-base-multilingual-cased-meetingbank\snapshots\5f0c82792b7ea14c6484e015b6a072009496b7f2'
    compressor = PromptCompressor(model_name=model, use_llmlingua2=True, device_map='cpu')
    result = compressor.compress_prompt(request['text'], rate=.5, force_tokens=['\n', ':', ';', '=', '<=', '>='], drop_consecutive=True)
json.dump({'text': result['compressed_prompt']}, sys.stdout, ensure_ascii=False)
