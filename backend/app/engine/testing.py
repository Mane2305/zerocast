"""Tiny random-weight Yug model for tests (same idea as the yug repo's tests/conftest.py).

Lives inside app/engine so nothing else needs to import yug. Never downloads weights.
"""

import torch
from yug import Yug_Model, YugConfig, YugPipeline

TINY_CONFIG = {
    "d_model": 32,
    "hidden_dim": 32,
    "num_attn_heads": 4,
    "num_decoder_layers": 2,
}


def make_tiny_pipeline(seed: int = 0) -> YugPipeline:
    torch.manual_seed(seed)
    config = YugConfig(**TINY_CONFIG)
    model = Yug_Model(config=config.to_arch_dict())
    return YugPipeline(model, config, device="cpu")
