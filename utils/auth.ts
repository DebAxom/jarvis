import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface TokenPayload extends JWTPayload {
    userId: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export async function generateTokens(payload: TokenPayload): Promise<AuthTokens> {

    const accessSecret = process.env.ACCESS_SECRET;
    const refreshSecret = process.env.REFRESH_SECRET;

    if (!accessSecret || !refreshSecret) {
        throw new Error('JWT secrets are not configured');
    }

    const accessKey = new TextEncoder().encode(accessSecret);
    const refreshKey = new TextEncoder().encode(refreshSecret);

    const accessToken = await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(accessKey);

    const refreshToken = await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15d')
        .sign(refreshKey);

    return {
        accessToken,
        refreshToken
    };
}

export async function verifyToken<T = TokenPayload>(token: string,rawSecret?: string | Uint8Array): Promise<T | null> {

    if (!rawSecret || !token) {
        return null;
    }

    const secret = typeof rawSecret === 'string' ? new TextEncoder().encode(rawSecret) : rawSecret;

    try {
        const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
        return payload as T;
    } catch {
        return null;
    }
}