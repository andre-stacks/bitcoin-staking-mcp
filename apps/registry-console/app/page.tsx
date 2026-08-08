import { currentSession } from "../lib/auth";
import RegistryEditor from "./registry-editor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session) return <main className="shell"><section className="card hero"><p className="eyebrow">Stacks Labs</p><h1>Scout Live Knowledge Registry</h1><p>Publish reviewed product facts without retraining Scout or releasing the MCP.</p><a className="button" href="/api/auth/authorize">Sign in with Vercel</a></section></main>;
  if (!session.publisher) return <main className="shell"><section className="card"><h1>Read-only access</h1><p>{session.email} is signed in, but is not in the publisher allowlist.</p><p>The public registry remains available at <a href="/api/v1/registry">/api/v1/registry</a>.</p></section></main>;
  return <RegistryEditor session={session} />;
}
