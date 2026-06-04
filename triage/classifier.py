"""
HAM10000 lesion classifier (the weak tie-breaker, not the decision-maker).

Lazy-loads a HuggingFace image-classification model. Defaults to the verified
ViT-base HAM10000 model; swap to EfficientNetV2-S via config for higher accuracy.

Honest framing: HAM10000 is trained on POLARIZED DERMOSCOPIC images. Without a
dermatoscope our captures are out-of-distribution, so this output is shown as a
low-weight tie-breaker, never the flag. The flag is gated on ABCD/TDS.
"""

from __future__ import annotations

import numpy as np

# HAM10000 7-class -> human label + whether it counts toward "flag"
CLASS_INFO = {
    "akiec": ("Actinic keratoses / intraepithelial carcinoma", True),
    "bcc": ("Basal cell carcinoma", True),
    "bkl": ("Benign keratosis", False),
    "df": ("Dermatofibroma", False),
    "mel": ("Melanoma", True),
    "nv": ("Melanocytic nevus", False),
    "vasc": ("Vascular lesion", False),
}


class LesionClassifier:
    def __init__(self, model_id: str = "ahishamm/vit-base-HAM-10000-patch-16",
                 device: str = ""):
        self.model_id = model_id
        self._model = None
        self._proc = None
        self._torch = None
        try:
            import torch
            from transformers import AutoImageProcessor, AutoModelForImageClassification

            self._torch = torch
            if not device:
                device = "cuda" if torch.cuda.is_available() else (
                    "mps" if torch.backends.mps.is_available() else "cpu")
            self._device = device
            self._model = AutoModelForImageClassification.from_pretrained(model_id).to(device)
            self._model.eval()
            # Many community HAM models ship without a preprocessor_config.json.
            # Fall back to the standard ViT processor, which matches their training.
            try:
                self._proc = AutoImageProcessor.from_pretrained(model_id)
            except Exception:
                self._proc = AutoImageProcessor.from_pretrained("google/vit-base-patch16-224-in21k")
                print("[classifier] using standard ViT processor (model shipped none)")
        except Exception as e:  # noqa: BLE001
            print(f"[classifier] unavailable ({e}); classifier disabled")
            self._model = None

    @property
    def available(self) -> bool:
        return self._model is not None

    def classify(self, bgr: np.ndarray) -> dict:
        """Return {'label','human','score','malignant_signal'} or empty dict."""
        if not self.available:
            return {}
        import cv2
        from PIL import Image

        img = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        inputs = self._proc(images=img, return_tensors="pt").to(self._device)
        with self._torch.no_grad():
            logits = self._model(**inputs).logits[0]
        probs = self._torch.softmax(logits, dim=-1).cpu().numpy()
        id2label = self._model.config.id2label
        order = probs.argsort()[::-1]
        top_idx = int(order[0])
        raw = str(id2label[top_idx]).lower().strip()
        key = next((k for k in CLASS_INFO if k in raw), raw)
        human, malignant = CLASS_INFO.get(key, (id2label[top_idx], False))
        return {
            "label": key,
            "human": human,
            "score": round(float(probs[top_idx]), 3),
            "malignant_signal": malignant,
            "all": [{"label": str(id2label[int(i)]), "score": round(float(probs[int(i)]), 3)}
                    for i in order[:3]],
        }
