/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'

export type NoticeDocument = { title: string; content: string }

/**
 * Body of the registration/risk notice, shared between the sign-up gate and
 * the public legal-centre page. Keep the t() literals identical so both
 * surfaces share the same translations.
 */
export function RegistrationNoticeContent(props: {
  documents?: NoticeDocument[]
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-5'>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Lawful use and prohibited activities')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'This notice covers registration, access, and use of this website. The platform means this website; its services include account management, API access, and related online services. The platform operator is the entity actually providing these services. Underlying technology developers and maintainers have distinct roles; responsibilities depend on actual conduct and applicable law. New API, described below, is the underlying project, not the identity of the platform operator.'
          )}
        </p>
        <p className='text-muted-foreground'>
          {t(
            'New API is an AI API gateway and usage management system for legally authorized scenarios, intended by default for personal, team, and private enterprise deployments.'
          )}
        </p>
        <p className='font-semibold'>
          {t(
            'You must not use this platform or its services to carry out, assist, or facilitate any unlawful activity, including fraud, money laundering, infringement of intellectual property or privacy, unauthorized access, cyberattacks, or creating or distributing unlawful content. Do not circumvent content moderation, access controls, or upstream safety restrictions.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Applicable law and authorized access')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'You must comply with the laws, regulations, and regulatory requirements where you are located and where the service is provided, as well as applicable AI governance frameworks and content safety requirements. Comply with upstream service terms, platform rules, and content policies. Use only accounts, API keys, model services, payment services, and other third-party services that you lawfully own or are authorized to use; do not access or distribute them beyond that authorization.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Platform operator content safety duties')}
        </h4>
        <p className='font-semibold'>
          {t(
            'The platform operator is responsible for ensuring that services provided through this platform meet content safety requirements. If you use these services to operate your own service, you must also fulfill the content safety duties arising from that role.'
          )}
        </p>
        <p className='text-muted-foreground'>
          {t(
            'Blocked-word filtering, logging, monitoring, and related features must serve content safety, abuse prevention, and compliance auditing. Operators must configure and maintain these controls and continually review and respond to risks. Enabling these features alone does not establish compliance. Users must not evade, disable, or undermine these safeguards for unlawful purposes.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Public-facing service obligations')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'When providing generative AI services to the public, the platform operator must fulfill applicable legal obligations concerning filing, licensing, identity management, content review, consumer protection, tax, payment, and upstream authorization. If you provide a separate public-facing service using this platform, you must independently fulfill the obligations arising from that activity; ordinary registration alone does not make you a public-service operator.'
          )}
        </p>
        <p className='font-semibold'>
          {t(
            'Public-facing services must establish abuse reporting, log auditing, and violation response mechanisms.'
          )}
        </p>
        <p className='text-muted-foreground'>
          {t(
            'Operators must provide an effective reporting channel, review complaints, retain necessary evidence lawfully, respond to violations, and cooperate with lawful regulatory or judicial requests. Logging and monitoring must follow applicable data protection rules, necessity limits, access controls, and retention requirements; they do not authorize unlimited collection or disclosure of user data.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Data privacy and account security')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'Requests may be sent to the relevant model providers. Submit only data you are authorized to process and share, and review the applicable privacy information and upstream policies before sending personal, confidential, or sensitive data. Keep passwords and API keys private, review permissions and usage regularly, and promptly revoke exposed keys and contact the operator about abnormal activity. Operators must independently fulfill their data protection and security duties.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('AI output and service risks')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'AI-generated content may be inaccurate, incomplete, biased, infringing, or unsuitable for your situation. Review inputs, outputs, and their intended use before publishing or relying on them; obtain qualified professional advice for significant decisions. System faults, network failures, or changes to upstream services may cause errors, interruptions, data loss, or additional costs. Assess these risks and maintain appropriate backups and safeguards.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Responsibility for violations and enforcement')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'You are legally responsible for your own unlawful conduct when using this platform or its services, including unlawful requests, content, distribution, operations, or assistance to others. Any resulting claims, penalties, losses, or legal proceedings are borne by the responsible person as required by law. Providing access or technical support does not transfer your responsibility to the platform operator, technology developers, or maintainers; each party remains responsible for its own conduct and legal duties.'
          )}
        </p>
        <p className='text-muted-foreground'>
          {t(
            'For suspected abuse or violations, the operator may take necessary and proportionate measures under applicable law and published service terms, including rejecting requests, restricting features, suspending or ending service, and lawfully retaining relevant evidence or cooperating with authorities. These measures do not remove responsibility already incurred.'
          )}
        </p>
      </section>
      <section className='space-y-1'>
        <h4 className='font-semibold'>
          {t('Service commitments and liability limitations')}
        </h4>
        <p className='text-muted-foreground'>
          {t(
            'The scope, availability, and commitments of these services are governed by applicable law and valid service agreements, including the services you have purchased. Do not assume that AI outputs are always accurate or that service is always uninterrupted or error-free. Underlying technology developers and maintainers provide technical capabilities and lawful technical support; this does not constitute a compliance review, endorsement, or operational guarantee for this platform.'
          )}
        </p>
        <p className='font-semibold'>
          {t(
            'To the maximum extent permitted by applicable law, underlying technology developers and maintainers are not liable for any damage or legal issues arising from use of this platform or its services, including those caused by unlawful or non-compliant use. Users and the platform operator bear responsibility for their own conduct as required by law.'
          )}
        </p>
        <p className='text-muted-foreground'>
          {t(
            'Nothing in this notice excludes or limits liability or user rights that cannot lawfully be excluded or limited, or relieves the platform operator of duties under applicable law or valid service agreements, including content safety, data protection, and consumer protection. A technology developer or maintainer who also operates the platform remains responsible for that role and their actual conduct. Applicable obligations under the underlying technology license also remain in effect.'
          )}
        </p>
      </section>

      {(props.documents ?? []).map((document) => (
        <section
          key={document.title}
          className='border-border space-y-3 border-t pt-4'
        >
          <h4 className='font-semibold'>{t(document.title)}</h4>
          {isHttpUrl(document.content) ? (
            <div className='space-y-2'>
              <p className='text-muted-foreground'>
                {t(
                  'This document is hosted externally. Open the full text before confirming.'
                )}
              </p>
              <a
                href={document.content}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary underline underline-offset-4'
              >
                {t('View document')} — {t(document.title)}
              </a>
            </div>
          ) : (
            <RichContent
              content={document.content}
              mode={isLikelyHtml(document.content) ? 'html' : 'markdown'}
              htmlVariant='isolated'
              className='prose-sm max-w-none break-words'
            />
          )}
        </section>
      ))}
      <p className='text-muted-foreground border-border border-t pt-4 text-xs'>
        {t('End of notice')}
      </p>
    </div>
  )
}
