from django.db import models
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
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

class GameHistory(models.Model):
    white_player = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='games_as_white', on_delete=models.SET_NULL, null=True)
    black_player = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='games_as_black', on_delete=models.SET_NULL, null=True)
    winner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='won_games', on_delete=models.SET_NULL, null=True, blank=True)
    moves = models.JSONField(default=list)
    
    # Przechowujemy też ELO w momencie gry (opcjonalne, ale fajne do wykresów)
    white_elo = models.IntegerField(default=1200)
    black_elo = models.IntegerField(default=1200)
    
    reason = models.CharField(max_length=50) # 'checkmate', 'timeout', 'resignation', 'agreement', 'stalemate'
    date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.white_player} vs {self.black_player} ({self.date})"

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

class PlayerProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    elo = models.IntegerField(default=1200) # Startowe punkty
    wins = models.IntegerField(default=0)
    losses = models.IntegerField(default=0)
    draws = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.user.username} ({self.elo})"

# Automatyczne tworzenie profilu przy rejestracji
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        PlayerProfile.objects.create(user=instance)

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def save_user_profile(sender, instance, **kwargs):
    instance.profile.save()
