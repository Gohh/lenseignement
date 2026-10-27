export const metadata = { title: 'Connexion impossible' };

export default function LoginErrorPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Connexion impossible</h1>
      <p>La connexion n’a pas abouti ou a expiré. Vous pouvez réessayer.</p>
      <p>
        <a
          href="/auth/login"
          className="inline-flex min-h-[44px] items-center rounded-card bg-primary px-5 font-bold text-surface no-underline"
        >
          Réessayer
        </a>
      </p>
    </section>
  );
}
