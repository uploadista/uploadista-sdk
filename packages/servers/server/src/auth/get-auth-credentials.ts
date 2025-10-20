export type AuthCredentialsResponse =
  | {
      isValid: true;
      data: { token: string; expiresIn: number };
    }
  | {
      isValid: false;
      error: string;
    };

export const getAuthCredentials = async ({
  uploadistaClientId,
  uploadistaApiKey,
  baseUrl = "https://api.uploadista.com",
}: {
  uploadistaClientId: string;
  uploadistaApiKey: string;
  baseUrl?: string;
}): Promise<AuthCredentialsResponse> => {
  const response = await fetch(
    `${baseUrl}/uploadista/auth/jwt?apiKey=${uploadistaApiKey}&clientId=${uploadistaClientId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (response.ok !== true) {
    return { isValid: false, error: "Failed to get auth credentials" };
  }

  const data = (await response.json()) as { token: string; expiresIn: number };

  return {
    isValid: true,
    data,
  };
};
