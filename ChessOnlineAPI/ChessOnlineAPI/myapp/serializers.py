from django.db.models import Q
from rest_framework import serializers
from .models import Room, GameHistory
from django.contrib.auth import get_user_model

User = get_user_model()

class RoomSerializer(serializers.ModelSerializer):
    players_count = serializers.IntegerField(read_only=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ['name', 'host', 'players_count', 'status', 'created_at', 'has_password']

    def get_has_password(self, obj):
        return bool(obj.password_hash)

class RoomCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=64)
    password = serializers.CharField(required=False, allow_blank=True)

class RoomJoinSerializer(serializers.Serializer):
    password = serializers.CharField(required=False, allow_blank=True)

class GameHistorySerializer(serializers.ModelSerializer):
    opponent = serializers.SerializerMethodField()
    result = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()

    class Meta:
        model = GameHistory
        fields = ['id', 'opponent', 'result', 'date', 'reason', 'moves', 'white_elo', 'black_elo']

    def get_date(self, obj):
        return obj.date.strftime("%Y-%m-%d")

    def get_opponent(self, obj):
        # Pobieramy request z kontekstu, żeby wiedzieć kim jest "current user"
        request = self.context.get('request')
        current_user = request.user if request else None
        
        if not current_user: 
            return "Unknown"

        if obj.white_player == current_user:
            return obj.black_player.username if obj.black_player else "Deleted User"
        else:
            return obj.white_player.username if obj.white_player else "Deleted User"

    def get_result(self, obj):
        request = self.context.get('request')
        current_user = request.user if request else None

        if not obj.winner:
            return "draw"
        if obj.winner == current_user:
            return "win"
        return "loss"

class GameHistoryDetailSerializer(serializers.ModelSerializer):
    boards = serializers.SerializerMethodField()
    white_username = serializers.CharField(source='white_player.username', read_only=True)
    black_username = serializers.CharField(source='black_player.username', read_only=True)
    result = serializers.SerializerMethodField()

    class Meta:
        model = GameHistory
        fields = ['id', 'white_username', 'black_username', 'result', 'reason', 'date', 'moves', 'boards']

    def get_boards(self, obj):
        moves = obj.moves # to jest lista np. ["e4", "e5"]
        if not moves:
            moves = []
        
        from myapp.chess_engine.Game_Manager import ChessGameManager
        
        mgr = ChessGameManager()
        boards_history = []
        
        boards_history.append(mgr.get_board_state())
        
        for move_notation in moves:
            try:
                mgr.make_move(move_notation) 
                
                boards_history.append(mgr.get_board_state())
            except Exception:
                break
                
        return boards_history 
    
    def get_result(self, obj):
        # Pobieramy użytkownika, który ogląda powtórkę
        request = self.context.get('request')
        current_user = request.user if request else None

        # Jeśli nie ma zwycięzcy = remis
        if not obj.winner:
            return "draw"
        
        # Jeśli oglądający to zwycięzca = win
        if obj.winner == current_user:
            return "win"
            
        # Jeśli oglądający brał udział ale przegrał = loss
        if current_user and (obj.white_player == current_user or obj.black_player == current_user):
            return "loss"
            
        # Jeśli ogląda osoba trzecia (obserwator), zwracamy np. kolor zwycięzcy lub po prostu "win"
        # Dla uproszczenia wyświetlania "Wynik: ...", zwróćmy nazwę usera lub kolor
        return f"Wygrana: {obj.winner.username}"

class UserSerializer(serializers.ModelSerializer):
    elo = serializers.IntegerField(source='profile.elo', read_only=True)
    stats = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()

    date_joined = serializers.DateTimeField(read_only=True, format="%Y-%m-%d")

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 
            'first_name', 'last_name', 
            'date_joined',              
            'elo', 'stats', 'history'   
        ]

        read_only_fields = ['id', 'email', 'date_joined', 'elo', 'stats', 'history']

    def get_stats(self, obj):
        if not hasattr(obj, 'profile'):
            return {
                'wins': 0, 'losses': 0, 'draws': 0, 'gamesPlayed': 0
            }
        
        return {
            'wins': obj.profile.wins,
            'losses': obj.profile.losses,
            'draws': obj.profile.draws,
            'gamesPlayed': obj.profile.wins + obj.profile.losses + obj.profile.draws
        }
    
    def get_history(self, obj):
        # Pobierz ostatnie 10 gier gdzie user był białym LUB czarnym
        games = GameHistory.objects.filter(
            Q(white_player=obj) | Q(black_player=obj)
        ).order_by('-date')[:10]
        
        return GameHistorySerializer(games, many=True, context=self.context).data
    
class LeaderboardSerializer(serializers.ModelSerializer):
    elo = serializers.IntegerField(source='profile.elo', read_only=True)
    stats = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['username', 'elo', 'stats']

    def get_stats(self, obj):
        if not hasattr(obj, 'profile'):
            return {'wins': 0, 'losses': 0, 'draws': 0, 'gamesPlayed': 0}
        
        p = obj.profile
        return {
            'wins': p.wins,
            'losses': p.losses,
            'draws': p.draws,
            'gamesPlayed': p.wins + p.losses + p.draws
        }
