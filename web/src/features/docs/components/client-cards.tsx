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
import {
  AppWindow,
  MessageSquare,
  SquareTerminal,
  SquareCode,
  Bot,
  TerminalSquare,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

import { API_KEY_PLACEHOLDER } from '../lib/samples'

type ClientCard = {
  name: string
  icon: ReactNode
  /** Menu path where the user enters the address, English UI names. */
  menuPath: string
  /** Base URL the client expects (`{base}` or `{base}/v1` depending on protocol). */
  addressPath: '' | '/v1'
  configTitle?: string
  config?: (baseUrl: string) => { code: string; language: string }
}

const CLIENTS: ClientCard[] = [
  {
    name: 'Cherry Studio',
    icon: <AppWindow />,
    menuPath: 'Settings → Model Provider → Add → OpenAI-compatible',
    addressPath: '/v1',
  },
  {
    name: 'Claude Code',
    icon: <SquareTerminal />,
    menuPath: 'Environment variables or `claude config`',
    addressPath: '',
    configTitle: 'Shell',
    config: (baseUrl) => ({
      language: 'bash',
      code: `export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_AUTH_TOKEN="${API_KEY_PLACEHOLDER}"`,
    }),
  },
  {
    name: 'Cursor',
    icon: <SquareCode />,
    menuPath: 'Settings → Models → OpenAI API Key → Override OpenAI Base URL',
    addressPath: '/v1',
  },
  {
    name: 'Codex CLI',
    icon: <TerminalSquare />,
    menuPath: '`~/.codex/config.toml` + environment variable',
    addressPath: '/v1',
    configTitle: '~/.codex/config.toml',
    config: (baseUrl) => ({
      language: 'toml',
      code: `model_provider = "selfhosted"

[model_providers.selfhosted]
name = "Self-hosted"
base_url = "${baseUrl}/v1"
env_key = "SELFHOSTED_API_KEY"`,
    }),
  },
  {
    name: 'ChatBox',
    icon: <MessageSquare />,
    menuPath: 'Settings → Model Provider → Add → OpenAI API → API Host',
    addressPath: '/v1',
  },
  {
    name: 'LobeChat',
    icon: <Bot />,
    menuPath: 'Settings → Language Model → OpenAI → API Proxy Address',
    addressPath: '/v1',
  },
]

export function ClientCards(props: { baseUrl: string }) {
  const { t } = useTranslation()

  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      {CLIENTS.map((client) => {
        const address = `${props.baseUrl}${client.addressPath}`
        return (
          <Card key={client.name} className='gap-3 py-4'>
            <CardHeader className='px-4'>
              <div className='flex items-center gap-2'>
                <span className='text-muted-foreground [&_svg]:size-4'>
                  {client.icon}
                </span>
                <h3 className='text-sm font-semibold'>{client.name}</h3>
              </div>
            </CardHeader>
            <CardContent className='space-y-3 px-4 text-sm'>
              <div className='space-y-1'>
                <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                  {t('Where to configure')}
                </p>
                <p className='text-sm'>{t(client.menuPath)}</p>
              </div>
              <div className='space-y-1'>
                <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                  {t('Base URL')}
                </p>
                <div className='flex items-center gap-2'>
                  <code className='bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 font-mono text-xs'>
                    {address}
                  </code>
                  <CopyButton
                    value={address}
                    size='icon'
                    className='size-7'
                    iconClassName='size-3.5'
                  />
                </div>
              </div>
              <div className='space-y-1'>
                <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                  {t('API key')}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Create a key on the API keys page and paste it into the client.'
                  )}
                </p>
              </div>
              <div className='space-y-1'>
                <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                  {t('Model')}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Use any model name from the model marketplace, e.g. the one selected above.'
                  )}
                </p>
              </div>
              {client.config && (
                <div className='space-y-1'>
                  <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                    {client.configTitle}
                  </p>
                  <CodeBlock
                    code={client.config(props.baseUrl).code}
                    language={client.config(props.baseUrl).language}
                    showLineNumbers={false}
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
