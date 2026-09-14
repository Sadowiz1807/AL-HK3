"""PyTorch CNN for 28x28 MNIST-style handwritten digits."""

from __future__ import annotations

import torch
from torch import Tensor, nn


class MNISTCNN(nn.Module):
    """Small baseline CNN: grayscale 28x28 image -> logits for digits 0..9."""

    def __init__(self, num_classes: int = 10) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.25),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: Tensor) -> Tensor:
        if x.ndim != 4 or x.shape[1:] != (1, 28, 28):
            raise ValueError(f"Expected input shape (N, 1, 28, 28), got {tuple(x.shape)}")
        return self.classifier(self.features(x))


def build_model(num_classes: int = 10, device: str | torch.device = "cpu") -> MNISTCNN:
    """Create an untrained model on the requested device."""
    return MNISTCNN(num_classes=num_classes).to(device)


def predict_proba(model: nn.Module, images: Tensor) -> Tensor:
    """Return class probabilities for normalized (N,1,28,28) images."""
    was_training = model.training
    model.eval()
    with torch.inference_mode():
        probabilities = torch.softmax(model(images), dim=1)
    model.train(was_training)
    return probabilities


if __name__ == "__main__":
    model = build_model()
    sample = torch.zeros(2, 1, 28, 28)
    output = model(sample)
    assert output.shape == (2, 10)
    assert torch.isfinite(output).all()
    print("PASS: MNISTCNN accepts (N,1,28,28) and returns (N,10) logits")
    # ponytail: no training smoke-test; verify only the model contract.
