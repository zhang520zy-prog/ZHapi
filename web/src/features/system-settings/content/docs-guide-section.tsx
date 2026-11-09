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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type DocsGuideSectionProps = {
  data: string
}

export function DocsGuideSection(props: DocsGuideSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [value, setValue] = useState(props.data)

  useEffect(() => {
    setValue(props.data)
  }, [props.data])

  const handleSave = async () => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.docs_guide_extra',
        value,
      })
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  return (
    <SettingsSection title={t('Integration guide notes')}>
      <div className='space-y-2'>
        <Label htmlFor='docs-guide-extra'>{t('Extra notes (Markdown)')}</Label>
        <Textarea
          id='docs-guide-extra'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder={t(
            'Additional notes shown at the bottom of the /docs integration guide.'
          )}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Rendered as Markdown below the error table on the integration guide page. Leave empty to hide the section.'
          )}
        </p>
      </div>
      <SettingsPageFormActions
        onSave={handleSave}
        isSaving={updateOption.isPending}
        saveLabel={t('Save integration guide notes')}
      />
    </SettingsSection>
  )
}
