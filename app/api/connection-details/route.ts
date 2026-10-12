import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json(
        { error: 'Server misconfigured. Missing LiveKit API keys.' },
        { status: 500 }
      );
    }

    // Generate unique room and candidate identity
    const roomName = `interview-${Math.random().toString(36).substring(2, 9)}`;
    const identity = `candidate-${Math.random().toString(36).substring(2, 7)}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: identity,
      ttl: '1h',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    return NextResponse.json({
      serverUrl: wsUrl,
      roomName: roomName,
      participantToken: jwt,
    });
  } catch (error) {
    console.error('Failed to generate token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
