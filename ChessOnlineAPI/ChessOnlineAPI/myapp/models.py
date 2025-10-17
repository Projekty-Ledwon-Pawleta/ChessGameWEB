from django.db import models
from django.conf import settings
# Create your models here.

class Game(models.Model):
    room_name = models.CharField(max_length=100, unique=True)
    state = models.TextField(blank=True, default="")   # JSON string produced by EngineWrapper
    moves = models.TextField(blank=True, default="")   # newline separated moves (optional duplication)
    white_player = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name='white_games', on_delete=models.SET_NULL)
    black_player = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name='black_games', on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def append_move(self, move_str: str):
        if self.moves:
            self.moves += "\n" + move_str
        else:
            self.moves = move_str
        # save only moves & updated_at, keep state saved by caller
        self.save(update_fields=["moves", "updated_at"])
