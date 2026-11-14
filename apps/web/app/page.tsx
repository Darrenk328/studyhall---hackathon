export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Studyhall</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Current answers with receipts. The chat UI arrives in the web-app phase; this page confirms the app builds.
      </p>
      <a className="text-sm underline underline-offset-4" href="/api/health">
        /api/health
      </a>
    </main>
  );
}
