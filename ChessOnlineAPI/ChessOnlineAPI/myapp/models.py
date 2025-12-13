from django.db import models
from django.conf import settings
# Create your models here.

class Game(models.Model):
    room_name = models.CharField(max_length=100, unique=True)
    state = models.TextField(blank=True, default="")   # JSON string produced by EngineWrapper
    white_player = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name='white_games', on_delete=models.SET_NULL)
    black_player = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name='black_games', on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

from django.contrib.auth.hashers import make_password, check_password

User = settings.AUTH_USER_MODEL

class Room(models.Model):
    STATUS_OPEN = 'open'
    STATUS_PLAYING = 'playing'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_PLAYING, 'Playing'),
        (STATUS_CLOSED, 'Closed'),
    ]

    name = models.CharField(max_length=100, unique=True)
    host = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='hosted_rooms')
    password_hash = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    players = models.ManyToManyField(User, related_name='rooms', blank=True)

    def __str__(self):
        return self.name

    @property
    def players_count(self):
        return self.players.count()

    def set_password(self, raw):
        if raw:
            self.password_hash = make_password(raw)
        else:
            self.password_hash = ''

    def check_password(self, raw):
        if not self.password_hash:
            return raw in (None, '',)
        return check_password(raw, self.password_hash)

