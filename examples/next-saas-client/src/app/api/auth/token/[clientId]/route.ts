import { getAuthCredentials } from "@uploadista/server/auth";
import { type NextRequest, NextResponse } from "next/server";

export const GET = async (
  _req: NextRequest,
  ctx: RouteContext<"/api/auth/token/[clientId]">,
) => {
  const { clientId } = await ctx.params;

  const apiKey = process.env.UPLOADISTA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "UPLOADISTA_API_KEY is not set" },
      { status: 500 },
    );
  }

  const response = await getAuthCredentials({
    uploadistaClientId: clientId,
    uploadistaApiKey: apiKey,
    baseUrl: "http://localhost:4200",
  });

  if (!response.isValid) {
    return NextResponse.json({ error: response.error }, { status: 500 });
  }

  return NextResponse.json(response.data);
};
