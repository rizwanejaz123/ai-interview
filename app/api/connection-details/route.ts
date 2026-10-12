import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const AGENT_NAME = 'sequence-interviewer';

export async function GET(_request: NextRequest) {
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

    const roomName = `interview-${Math.random().toString(36).substring(2, 9)}`;
    const identity = `candidate-${Math.random().toString(36).substring(2, 7)}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: '1h',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
    });

    // Agent dispatch must be on the JWT roomConfig — putting it only in the
    // JSON body does nothing; LiveKit never sees it and the agent never joins.
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: AGENT_NAME,
        }),
      ],
    });

    const jwt = await token.toJwt();

    return NextResponse.json({
      serverUrl: wsUrl,
      roomName,
      participantToken: jwt,
      agentName: AGENT_NAME,
    });
  } catch (error) {
    console.error('Failed to generate token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
