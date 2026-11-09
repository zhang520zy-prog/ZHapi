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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { EmptyState } from '@/components/empty-state'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getPricing } from '@/features/pricing/api'
import { getUserModels } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  buildSample,
  PROTOCOLS,
  type ProtocolId,
  SAMPLE_LANGS,
  type SampleLang,
  sampleLanguage,
} from '../lib/samples'

function useAvailableModels() {
  const user = useAuthStore((s) => s.auth.user)
  const userModels = useQuery({
    queryKey: ['docs-user-models'],
    queryFn: async () => requireServerSuccess(await getUserModels()),
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  })
  const pricing = useQuery({
    queryKey: ['docs-pricing-models'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    enabled: !user,
    staleTime: 5 * 60 * 1000,
  })

  const models = useMemo(() => {
    if (user) {
      return [...(userModels.data?.data ?? [])].sort()
    }
    const names = (pricing.data?.data ?? []).map((item) => item.model_name)
    return [...new Set(names)].sort()
  }, [user, userModels.data, pricing.data])

  return { models, loading: userModels.isLoading || pricing.isLoading }
}

export function ProtocolExamples(props: { baseUrl: string }) {
  const { t } = useTranslation()
  const { models } = useAvailableModels()
  const [model, setModel] = useState('')
  const [protocol, setProtocol] = useState<ProtocolId>('openai-chat')
  const [lang, setLang] = useState<SampleLang>('curl')

  useEffect(() => {
    if (!model && models.length > 0) {
      setModel(models[0])
    }
  }, [model, models])

  if (models.length === 0) {
    return <EmptyState title={t('No models available')} />
  }

  const code = buildSample(protocol, lang, props.baseUrl, model)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1.5'>
          <Label htmlFor='docs-model-select'>{t('Model')}</Label>
          <Select
            value={model}
            onValueChange={(value) => value && setModel(value)}
          >
            <SelectTrigger id='docs-model-select' className='w-64'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {models.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <p className='text-muted-foreground pb-2 text-sm'>
          {t('Replace sk-xxxx with the key you created on the API keys page.')}
        </p>
      </div>

      <Tabs
        value={protocol}
        onValueChange={(v) => setProtocol(v as ProtocolId)}
      >
        <TabsList className='bg-muted/40 h-8 p-0.5'>
          {PROTOCOLS.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className='h-7 px-3 text-xs'
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Tabs value={lang} onValueChange={(v) => setLang(v as SampleLang)}>
        <TabsList className='bg-muted/40 h-8 p-0.5'>
          {SAMPLE_LANGS.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className='h-7 px-3 text-xs'
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SAMPLE_LANGS.map((item) => (
          <TabsContent key={item.id} value={item.id} className='mt-3'>
            <CodeBlock code={code} language={sampleLanguage(item.id)}>
              <CodeBlockCopyButton />
            </CodeBlock>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
