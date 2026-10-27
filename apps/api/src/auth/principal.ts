/** Identité authentifiée extraite d'un jeton d'accès vérifié. */
export interface Principal {
  /** Identifiant OIDC stable (`sub`), jamais un identifiant administratif. */
  subject: string;
  roles: readonly string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}
