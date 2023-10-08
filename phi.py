import os
import sys

env = os.environ
maxLength = int(env.get("PHI_MAX_LENGTH", 50))

v = sys.version_info
home = env.get("HOME")
sys.path.append(f"{home}/.local/lib/python{v.major}.{v.minor}/site-packages")

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

torch.set_default_device("cpu")

model = AutoModelForCausalLM.from_pretrained(
    "microsoft/phi-1_5", trust_remote_code=True)
tokenizer = AutoTokenizer.from_pretrained(
    "microsoft/phi-1_5", trust_remote_code=True)

print("ready", end="", flush=True)

while True:
    lines = sys.stdin.readline().splitlines()
    if len(lines) == 0:
        break
    text = lines[0]
    inputs = tokenizer(text, return_tensors="pt", return_attention_mask=False)
    length = maxLength + len(text.split())
    outputs = model.generate(**inputs, max_length=length)
    print(tokenizer.batch_decode(outputs)[0], end="", flush=True)
