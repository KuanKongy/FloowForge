import type { Metadata } from "next";
import Link from "next/link";
import { LegalArticle, LegalSection } from "@/components/site/LegalArticle";

export const metadata: Metadata = {
  title: "Terms of Service · FloowForge",
  description: "The terms that govern use of FloowForge, the no-code AI workflow platform.",
};

const CONTACT_EMAIL = "khanhpronam@gmail.com";

export default function TermsPage() {
  return (
    <LegalArticle
      title="Terms of Service"
      lastUpdated="September 13, 2026"
      intro={
        <p>
          These Terms of Service (the &quot;Terms&quot;) govern your access to and use of
          FloowForge — the website, application, and API that let you build, run, and
          share AI workflows (together, the &quot;Service&quot;). By creating an account or
          using the Service you agree to these Terms. If you do not agree, do not use
          the Service.
        </p>
      }
    >
      <LegalSection number={1} title="Acceptance of these Terms">
        <p>
          You must be able to form a binding contract to use the Service. If you use the
          Service on behalf of an organization, you represent that you have authority to
          bind that organization, and &quot;you&quot; refers to it. We may update these
          Terms as the Service evolves; the &quot;Last updated&quot; date above reflects
          the current version. Material changes will be announced in the product or by
          email, and continued use after a change takes effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection number={2} title="The Service">
        <p>
          FloowForge is a no-code platform for composing AI workflows: you arrange nodes
          on a canvas, connect them, and execute the resulting graph on our servers.
          Workflows can be started manually, by incoming webhooks, on schedules, or
          through public form links, and their results can be delivered by outgoing
          callbacks. The Service is currently offered in beta: features may change,
          be added, or be removed at any time, and occasional downtime or data-model
          changes are more likely than in a finished product.
        </p>
      </LegalSection>

      <LegalSection number={3} title="Accounts and eligibility">
        <p>
          You need an account to build workflows. You are responsible for the activity
          that happens under your account and for keeping your credentials secure.
          Sign-in is provided through Supabase Auth (email/password or Google). You must
          provide accurate information and may not impersonate anyone else or create
          accounts to evade limits or enforcement.
        </p>
      </LegalSection>

      <LegalSection number={4} title="Acceptable use">
        <p>Do not use the Service to:</p>
        <ul>
          <li>violate any law, or infringe anyone&apos;s rights, including intellectual-property and privacy rights;</li>
          <li>generate, store, or distribute content that is unlawful, or that harasses, defames, or exploits anyone;</li>
          <li>probe, scan, or test the vulnerability of the Service, or bypass authentication or access controls;</li>
          <li>circumvent, disable, or interfere with rate limits, device identification, or other anti-abuse measures — including by rotating accounts, forging request headers, or automating traffic designed to evade them;</li>
          <li>resell, sublicense, or provide the Service to third parties as your own service;</li>
          <li>send spam or unsolicited messages through workflows, forms, or callbacks; or</li>
          <li>impose an unreasonable load on the Service&apos;s infrastructure.</li>
        </ul>
        <p>
          We may throttle, suspend, or terminate accounts that violate this section,
          and remove content or workflows that we reasonably believe break these Terms.
        </p>
      </LegalSection>

      <LegalSection number={5} title="Your content and workflows">
        <p>
          You own the workflows you build, the prompts and files you provide, and the
          outputs of your runs (&quot;Your Content&quot;). You grant us a limited,
          worldwide, non-exclusive license to host, store, process, transmit, and
          display Your Content solely as needed to operate and improve the Service —
          for example, executing your flows, storing run history, streaming results to
          your browser, and delivering callbacks you configured. We do not use Your
          Content to train models. You are responsible for Your Content, including
          having the rights to any material you upload.
        </p>
      </LegalSection>

      <LegalSection number={6} title="Your API keys">
        <p>
          Workflows call AI providers using credentials you connect (OpenAI, Google
          Gemini, Cloudflare Workers AI, DeepSeek). Those keys remain yours: usage under
          them is billed by the provider under your agreement with that provider, and
          you are responsible for complying with each provider&apos;s terms. We store
          connected credentials encrypted at rest and decrypt them only to execute your
          runs. You can remove a connected key at any time; consider rotating a key at
          the provider if you believe it was exposed anywhere.
        </p>
      </LegalSection>

      <LegalSection number={7} title="AI output disclaimer">
        <p>
          Workflow outputs are produced by third-party AI models. They can be
          inaccurate, incomplete, offensive, or unsuitable for your purpose, and they
          are not advice of any kind. You are responsible for reviewing outputs before
          relying on or distributing them. We make no warranty about the accuracy,
          quality, or fitness of AI-generated content.
        </p>
      </LegalSection>

      <LegalSection number={8} title="Intellectual property">
        <p>
          The Service — its software, design, and branding — is owned by the FloowForge
          project and protected by law. These Terms grant you a limited, revocable,
          non-exclusive, non-transferable right to use the Service as intended. Feedback
          you send us may be used to improve the Service without obligation to you.
        </p>
      </LegalSection>

      <LegalSection number={9} title="Fees">
        <p>
          The Service is currently free to use; AI usage is billed directly by the
          providers whose keys you connect. We reserve the right to introduce paid
          plans or usage-based fees in the future. If that happens, pricing will be
          announced in advance, and no charge will apply to you without your explicit
          agreement.
        </p>
      </LegalSection>

      <LegalSection number={10} title="Suspension and termination">
        <p>
          You may stop using the Service and request deletion of your account at any
          time. We may suspend or terminate your access if you materially breach these
          Terms, create risk or legal exposure for us or other users, or if we
          discontinue the Service. Where reasonable, we will give you notice and an
          opportunity to export Your Content. Sections that by their nature should
          survive termination (including 5, 7, 8, 11, 12, and 13) survive.
        </p>
      </LegalSection>

      <LegalSection number={11} title="Disclaimers">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;,
          WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
          NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
          SECURE, OR ERROR-FREE, OR THAT DATA WILL NEVER BE LOST — KEEP COPIES OF
          ANYTHING YOU CANNOT AFFORD TO LOSE.
        </p>
      </LegalSection>

      <LegalSection number={12} title="Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE FLOOWFORGE PROJECT AND ITS
          MAINTAINERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR
          GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE. OUR AGGREGATE
          LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF
          THE AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM
          OR FIFTY US DOLLARS (US $50).
        </p>
      </LegalSection>

      <LegalSection number={13} title="Indemnification">
        <p>
          You will defend and indemnify the FloowForge project and its maintainers
          against claims, damages, and expenses (including reasonable legal fees)
          arising from Your Content, your use of the Service in violation of these
          Terms, or your violation of any law or third-party right.
        </p>
      </LegalSection>

      <LegalSection number={14} title="Governing law">
        <p>
          These Terms are governed by the laws of the jurisdiction in which the
          Service&apos;s operator resides, without regard to conflict-of-law rules.
          Courts located in that jurisdiction have exclusive jurisdiction over disputes
          arising from these Terms or the Service, and you consent to their venue.
        </p>
      </LegalSection>

      <LegalSection number={15} title="Changes to these Terms">
        <p>
          When we change these Terms we will update the &quot;Last updated&quot; date
          above and, for material changes, provide additional notice in the product or
          by email. Changes apply prospectively from their effective date.
        </p>
      </LegalSection>

      <LegalSection number={16} title="Contact">
        <p>
          Questions about these Terms:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or any channel on the{" "}
          <Link href="/contact">Contact page</Link>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
