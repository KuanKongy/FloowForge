import type { Metadata } from "next";
import Link from "next/link";
import { LegalArticle, LegalSection } from "@/components/site/LegalArticle";

export const metadata: Metadata = {
  title: "Privacy Policy · FloowForge",
  description:
    "How FloowForge collects, uses, and protects personal data across the AI workflow platform.",
};

const CONTACT_EMAIL = "khanhpronam@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalArticle
      title="Privacy Policy"
      lastUpdated="September 13, 2026"
      intro={
        <p>
          This policy explains what data FloowForge (&quot;we&quot;) collects when you
          use the website, application, and API (the &quot;Service&quot;), why we
          collect it, and the choices you have. The short version: we collect what is
          needed to run your workflows, keep accounts separate, and stop abuse — and
          nothing is sold or used for advertising.
        </p>
      }
    >
      <LegalSection number={1} title="Data we collect">
        <p>
          <strong className="text-[var(--foreground)]">Account data.</strong>{" "}
          Authentication is handled by Supabase Auth. We store your email address, an
          optional display name and avatar, and account timestamps. If you sign in with
          Google, we receive the email and basic profile Google shares; we never see
          your password.
        </p>
        <p>
          <strong className="text-[var(--foreground)]">Workflow content.</strong> The
          flows you build (nodes, connections, prompts, saved versions), the runs they
          produce (inputs, outputs, per-node status and timings), files you upload, and
          media your runs generate.
        </p>
        <p>
          <strong className="text-[var(--foreground)]">Provider credentials.</strong>{" "}
          API keys you connect for OpenAI, Google Gemini, Cloudflare Workers AI, or
          DeepSeek, stored encrypted (see Section 8).
        </p>
        <p>
          <strong className="text-[var(--foreground)]">
            Technical signals for abuse prevention.
          </strong>{" "}
          To keep the Service fair on shared networks (a university campus, for
          example), our rate limiting records, per request: IP address; a device
          identifier consisting of a random ID stored in your browser plus a short
          hash of coarse device characteristics; browser and operating system derived
          from the user-agent; preferred language; timezone; the endpoint called; the
          response status; and a timestamp. Blocked or failed requests are always
          recorded; ordinary successful reads are only sampled. There is no canvas
          fingerprinting and no third-party tracking.
        </p>
      </LegalSection>

      <LegalSection number={2} title="How we use data">
        <ul>
          <li>Operating the Service: executing runs, streaming results, storing history, delivering webhooks and callbacks you configure.</li>
          <li>Fair use and abuse prevention: enforcing per-account and per-device rate limits, investigating floods, spam, and attempts to bypass limits.</li>
          <li>Security: authenticating sessions, verifying webhook signatures, auditing suspicious activity.</li>
          <li>Communication: service announcements and responses to your requests.</li>
        </ul>
        <p>
          We do not sell personal data, we do not use it for advertising, and we do not
          use Your Content to train AI models.
        </p>
      </LegalSection>

      <LegalSection number={3} title="Where your data lives (processors)">
        <p>
          <strong className="text-[var(--foreground)]">Supabase</strong> hosts our
          database, authentication, file storage, and the realtime channel that streams
          run progress; all persistent Service data lives there, protected by row-level
          security that scopes each row to its owner&apos;s account.
        </p>
        <p>
          <strong className="text-[var(--foreground)]">AI providers.</strong> When a
          workflow runs an AI node, that node&apos;s inputs are sent to the provider
          whose key you connected — OpenAI, Google, Cloudflare, or DeepSeek — to
          generate the output. Their handling of that data is governed by their own
          terms and privacy policies under your provider account. Nothing is sent to a
          provider except to execute your runs.
        </p>
        <p>
          <strong className="text-[var(--foreground)]">Redis</strong> (our job queue
          and rate-limit store) transiently holds queued run jobs and short-lived
          counters keyed by account, device identifier, and IP.
        </p>
      </LegalSection>

      <LegalSection number={4} title="Cookies and local storage">
        <ul>
          <li>
            <strong className="text-[var(--foreground)]">Session cookies</strong>{" "}
            (names beginning <code className="text-xs">sb-</code>) keep you signed in.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">ff_client_id</strong> — the
            random device identifier described in Section 1, stored in localStorage and
            sent with API requests for rate limiting.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Theme preference</strong> —
            your light/dark choice, stored locally.
          </li>
        </ul>
        <p>There are no advertising or third-party analytics cookies.</p>
      </LegalSection>

      <LegalSection number={5} title="Retention">
        <ul>
          <li>Account data and workflow content: kept until you delete them or your account.</li>
          <li>Technical signal logs (Section 1): kept for 90 days, then deleted.</li>
          <li>Rate-limit counters in Redis: expire automatically within minutes to hours.</li>
          <li>Generated media: kept in a private bucket until you delete the runs that produced it.</li>
        </ul>
      </LegalSection>

      <LegalSection number={6} title="Your rights">
        <p>
          You can access and update your profile in the app, delete flows, runs, and
          connected credentials at any time, and export your data or request full
          account deletion by contacting us. Depending on where you live, you may have
          statutory rights to access, correct, delete, or port your personal data, and
          to object to or restrict certain processing — write to us and we will honor
          them.
        </p>
      </LegalSection>

      <LegalSection number={7} title="Public forms and other people's data">
        <p>
          If you share a public form, submissions (including any files) become part of
          your run history. You are responsible for what you ask submitters to provide
          and for handling their data lawfully. Submitters&apos; requests are subject
          to the same technical-signal collection described in Section 1, which also
          protects your provider keys from abuse of your links.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Security">
        <ul>
          <li>All traffic is encrypted in transit with TLS.</li>
          <li>Connected provider credentials are encrypted at rest with AES-256-GCM and decrypted only at execution time.</li>
          <li>Every database row is scoped to its owner by row-level security.</li>
          <li>Incoming webhooks and outgoing callbacks are HMAC-signed.</li>
          <li>Generated media is served from a private bucket via short-lived signed URLs.</li>
        </ul>
        <p>
          No system is perfectly secure; if a breach affects your data we will notify
          you as required by law.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Students and younger users">
        <p>
          The Service is intended for adults and university students. It is not
          directed at children under 13 (or the higher minimum age your jurisdiction
          sets for consenting to data processing), and we do not knowingly collect
          data from them.
        </p>
      </LegalSection>

      <LegalSection number={10} title="Changes to this policy">
        <p>
          When this policy changes we update the &quot;Last updated&quot; date above,
          and announce material changes in the product or by email. If a change expands
          what we collect, it applies going forward, not retroactively.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Contact">
        <p>
          Privacy questions or requests:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or any channel on
          the <Link href="/contact">Contact page</Link>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
