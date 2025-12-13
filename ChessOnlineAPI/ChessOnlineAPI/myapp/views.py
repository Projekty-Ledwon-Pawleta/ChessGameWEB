from django.http import HttpResponse
from rest_framework.generics import ListAPIView, GenericAPIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from .models import Room
from .serializers import (
    RoomCreateSerializer,
    RoomJoinSerializer,
    RoomSerializer,
)

def home(request):
    return HttpResponse("Hello from my new app!")


class RoomListAPIView(ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = RoomSerializer
    queryset = Room.objects.order_by('-created_at')[:200]


class RoomCreateAPIView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = RoomCreateSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        name = serializer.validated_data['name']
        password = serializer.validated_data.get('password', '')

        if Room.objects.filter(name=name).exists():
            return Response(
                {'detail': 'room name already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )

        room = Room.objects.create(name=name, host=request.user)
        room.set_password(password)
        room.save()
        room.players.add(request.user)

        return Response(RoomSerializer(room).data, status=status.HTTP_201_CREATED)


class RoomJoinAPIView(GenericAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = RoomJoinSerializer

    def post(self, request, name):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        password = serializer.validated_data.get('password', '')
        room = get_object_or_404(Room, name=name)

        if room.status != Room.STATUS_OPEN:
            return Response({'detail': 'room not open'}, status=status.HTTP_400_BAD_REQUEST)

        if room.players_count >= 2:
            return Response({'detail': 'room full'}, status=status.HTTP_400_BAD_REQUEST)

        if not room.check_password(password):
            return Response({'detail': 'invalid password'}, status=status.HTTP_403_FORBIDDEN)

        room.players.add(request.user)

        return Response(RoomSerializer(room).data)
