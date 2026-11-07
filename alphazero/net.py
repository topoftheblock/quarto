import torch
from torch import nn

from .env import INPUT_SIZE, NUM_ACTIONS


class ResBlock(nn.Module):
    def __init__(self, width):
        super().__init__()
        self.body = nn.Sequential(
            nn.Linear(width, width), nn.LayerNorm(width), nn.ReLU(),
            nn.Linear(width, width), nn.LayerNorm(width),
        )

    def forward(self, x):
        return torch.relu(x + self.body(x))


class QuartoNet(nn.Module):
    """Policy/value network: state -> (logits over 256 actions, value in [-1, 1])."""

    def __init__(self, width=256, blocks=4):
        super().__init__()
        self.config = {"width": width, "blocks": blocks}
        self.stem = nn.Sequential(nn.Linear(INPUT_SIZE, width), nn.ReLU())
        self.trunk = nn.Sequential(*[ResBlock(width) for _ in range(blocks)])
        self.policy = nn.Linear(width, NUM_ACTIONS)
        self.value = nn.Sequential(nn.Linear(width, 64), nn.ReLU(), nn.Linear(64, 1), nn.Tanh())

    def forward(self, x):
        h = self.trunk(self.stem(x))
        return self.policy(h), self.value(h).squeeze(-1)


def save(net, path, **extra):
    torch.save({"config": net.config, "state_dict": net.state_dict(), **extra}, path)


def load(path):
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    net = QuartoNet(**checkpoint["config"])
    net.load_state_dict(checkpoint["state_dict"])
    net.eval()
    return net, checkpoint
