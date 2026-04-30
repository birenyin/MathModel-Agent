from __future__ import annotations

try:
    import httpx
except ImportError:  # The app can still demo workflows without a model provider.
    httpx = None


class LLMClient:
    def __init__(self, settings: dict[str, str]):
        self.base_url = settings.get("model_base_url", "").rstrip("/")
        self.model = settings.get("model_name", "")
        self.api_key = settings.get("model_api_key", "")

    async def complete(self, system: str, prompt: str) -> str:
        if httpx is None:
            return self._fallback(prompt)

        if not self.base_url or not self.model or not self.api_key:
            return self._fallback(prompt)

        url = f"{self.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
        }
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    async def list_models(self) -> list[str]:
        if httpx is None:
            raise RuntimeError("httpx is not installed")
        if not self.base_url or not self.api_key:
            raise ValueError("base URL and API key are required")

        url = f"{self.base_url}/models"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()

        items = data.get("data", data if isinstance(data, list) else [])
        models: list[str] = []
        for item in items:
            if isinstance(item, str):
                models.append(item)
            elif isinstance(item, dict) and item.get("id"):
                models.append(str(item["id"]))
        return sorted(set(models))

    def _fallback(self, prompt: str) -> str:
        excerpt = prompt.strip().replace("\r\n", "\n")[:1200]
        return (
            "Local fallback draft\n\n"
            "No model provider is configured yet, so this artifact is a deterministic "
            "placeholder. Configure an OpenAI-compatible base URL, model name, and API key "
            "in Settings to generate real content.\n\n"
            "Input excerpt:\n\n"
            f"{excerpt}\n"
        )
