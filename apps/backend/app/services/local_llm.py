from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Optional

from app.config import AnalysisConfig
from app.logging import get_logger

logger = get_logger("app.services.local_llm")


@dataclass
class LocalGenerationClient:
    config: AnalysisConfig

    def __post_init__(self) -> None:
        self.model_name = self.config.local_llm_model
        self._model = None
        self._tokenizer = None
        self._torch = None
        self._device = self.config.local_llm_device
        self._unavailable_reason: Optional[str] = None

    @property
    def unavailable_reason(self) -> Optional[str]:
        return self._unavailable_reason

    @property
    def available(self) -> bool:
        return self._ensure_loaded()

    def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_new_tokens: int,
        temperature: float,
    ) -> str:
        if not self._ensure_loaded():
            raise RuntimeError(self._unavailable_reason or "Local language model is unavailable.")

        torch = self._torch
        tokenizer = self._tokenizer
        model = self._model
        if torch is None or tokenizer is None or model is None:
            raise RuntimeError("Local language model did not finish loading.")

        messages = [
            {"role": "system", "content": system_prompt.strip()},
            {"role": "user", "content": user_prompt.strip()},
        ]

        if hasattr(tokenizer, "apply_chat_template"):
            inputs = tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                return_tensors="pt",
            )
            attention_mask = torch.ones_like(inputs)
        else:
            rendered = f"{system_prompt.strip()}\n\n{user_prompt.strip()}"
            encoded = tokenizer(rendered, return_tensors="pt")
            inputs = encoded["input_ids"]
            attention_mask = encoded.get("attention_mask", torch.ones_like(inputs))

        if self._device:
            inputs = inputs.to(self._device)
            attention_mask = attention_mask.to(self._device)

        pad_token_id = tokenizer.pad_token_id or tokenizer.eos_token_id
        generation_kwargs = {
            "input_ids": inputs,
            "attention_mask": attention_mask,
            "max_new_tokens": max_new_tokens,
            "do_sample": temperature > 0.0,
            "pad_token_id": pad_token_id,
        }
        if temperature > 0.0:
            generation_kwargs["temperature"] = max(temperature, 0.05)

        with torch.inference_mode():
            logger.debug(
                "Generating with local LLM model=%s device=%s max_new_tokens=%s temperature=%.2f",
                self.model_name,
                self._device,
                max_new_tokens,
                temperature,
            )
            generated = model.generate(**generation_kwargs)

        generated_tokens = generated[0, inputs.shape[-1] :]
        text = tokenizer.decode(generated_tokens, skip_special_tokens=True)
        return text.strip()

    def _ensure_loaded(self) -> bool:
        if self._model is not None and self._tokenizer is not None:
            return True
        if self._unavailable_reason:
            return False
        if os.getenv("PYTEST_CURRENT_TEST"):
            self._unavailable_reason = "Local LLM loading is disabled during pytest runs."
            return False

        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except Exception as error:
            self._unavailable_reason = f"Local LLM dependencies unavailable: {error}"
            logger.warning(self._unavailable_reason)
            return False

        try:
            device = self._device or ("cuda" if torch.cuda.is_available() else "cpu")
            dtype = torch.float16 if device == "cuda" else torch.float32
            logger.info("Loading local LLM model=%s device=%s", self.model_name, device)
            tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                cache_dir=self.config.local_llm_cache_dir,
                trust_remote_code=self.config.local_llm_trust_remote_code,
            )
            model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                cache_dir=self.config.local_llm_cache_dir,
                trust_remote_code=self.config.local_llm_trust_remote_code,
                torch_dtype=dtype,
            )
            model.to(device)
            model.eval()

            if tokenizer.pad_token_id is None and tokenizer.eos_token_id is not None:
                tokenizer.pad_token_id = tokenizer.eos_token_id

            self._torch = torch
            self._device = device
            self._tokenizer = tokenizer
            self._model = model
            logger.info("Local LLM ready model=%s device=%s", self.model_name, device)
            return True
        except Exception as error:
            self._unavailable_reason = f"Local LLM load failed: {error}"
            logger.warning(self._unavailable_reason)
            self._model = None
            self._tokenizer = None
            self._torch = None
            return False
