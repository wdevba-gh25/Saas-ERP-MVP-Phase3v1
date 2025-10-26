import requests

while True:
    prompt = input("You: ")
    response = requests.post(
        "http://192.168.1.7:8001/v1/completions",
        json={
            "model": "mistral-7b-instruct-v0.2.Q4_K_M.gguf",  # optional, your model is already loaded
            "prompt": prompt,
            "max_tokens": 50,
        },
    )
    data = response.json()
    print("Mistral:", data["choices"][0]["text"])
