export const biometricService = {
  // Checks if the user's phone actually supports fingerprint/FaceID hardware for web links
  async isBiometricSupported(): Promise<boolean> {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  },

  // Registers a fresh biometric credential tied to the resident's account
  async registerBiometric(userId: string, userEmail: string) {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const createOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: { name: "Omaxe Heights Connect", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: userEmail,
          displayName: userEmail.split('@')[0]
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 algorithm support
        authenticatorSelection: {
          authenticatorAttachment: "platform", // Forces device-native biometrics (Fingerprint/FaceID)
          userVerification: "required"
        },
        timeout: 60000
      };

      const credential = await navigator.credentials.create({ publicKey: createOptions }) as PublicKeyCredential;
      if (credential) {
        // Save a flag in local storage indicating this device has a registered biometric token
        localStorage.setItem(`biometric_registered_${userId}`, 'true');
        return true;
      }
      return false;
    } catch (error) {
      console.error("Biometric registration failed:", error);
      return false;
    }
  },

  // Verifies the user's print when returning to the application
  async authenticateBiometric(): Promise<boolean> {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const getOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        rpId: window.location.hostname,
        userVerification: "required"
      };

      const assertion = await navigator.credentials.get({ publicKey: getOptions });
      return assertion !== null;
    } catch (error) {
      console.error("Biometric verification failed:", error);
      return false;
    }
  }
};
