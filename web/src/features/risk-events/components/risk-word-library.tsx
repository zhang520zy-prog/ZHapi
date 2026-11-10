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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { handleServerError } from '@/lib/handle-server-error'

import {
  commitRiskWordImport,
  createRiskWordCategory,
  deleteRiskWordCategory,
  exportRiskWords,
  listRiskWordCategories,
  previewRiskWordImport,
  RISK_CATEGORY_DISABLED,
  RISK_CATEGORY_ENABLED,
  updateRiskWordCategory,
  type RiskImportMode,
  type RiskImportPreview,
  type RiskWordCategory,
} from '../api'
import { riskCategoryActionLabel } from '../status'

const GENERAL_CATEGORY_KEY = 'general'
const IMPORT_MAX_BYTES = 2 * 1024 * 1024

const categorySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,32}$/),
  name: z.string().trim().min(1).max(64),
  action: z.enum(['record', 'block', 'block_restrict']),
  enabled: z.boolean(),
})
type CategoryFormInput = z.infer<typeof categorySchema>

export function RiskWordLibrary(props: { canManage: boolean }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['risk', 'categories'],
    queryFn: listRiskWordCategories,
    retry: false,
  })
  const [formTarget, setFormTarget] = useState<
    'create' | RiskWordCategory | null
  >(null)
  const [importTarget, setImportTarget] = useState<RiskWordCategory | null>(
    null
  )
  const [deleteTarget, setDeleteTarget] = useState<RiskWordCategory | null>(
    null
  )

  const updateMutation = useMutation({
    mutationFn: (input: { category: RiskWordCategory; enabled: boolean }) =>
      updateRiskWordCategory(input.category.id, {
        name: input.category.name,
        action: input.category.action,
        status: input.enabled ? RISK_CATEGORY_ENABLED : RISK_CATEGORY_DISABLED,
        expected_version: input.category.version,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error(t('The record was changed by someone else. Reloaded.'))
        void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
        return
      }
      handleServerError(error, t('Failed to update category'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (category: RiskWordCategory) =>
      deleteRiskWordCategory(category.id, category.version),
    onSuccess: () => {
      setDeleteTarget(null)
      toast.success(t('Deleted'))
      void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error(t('The record was changed by someone else. Reloaded.'))
        void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
        setDeleteTarget(null)
        return
      }
      handleServerError(error, t('Failed to delete category'))
    },
  })
  const exportMutation = useMutation({
    mutationFn: (category: RiskWordCategory) => exportRiskWords(category.id),
    onSuccess: (blob, category) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `risk-words-${category.key}.txt`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },
    onError: (error) => handleServerError(error, t('Failed to export words')),
  })

  if (query.isPending) return <LoadingState />
  if (query.isError) {
    return (
      <ErrorState
        title={t('Failed to load categories')}
        onRetry={() => void query.refetch()}
      />
    )
  }
  const categories = query.data
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Words are maintained by file import and export. Their contents are never shown on this page.'
          )}
        </p>
        {props.canManage && (
          <Button size='sm' onClick={() => setFormTarget('create')}>
            {t('New category')}
          </Button>
        )}
      </div>
      {!categories.length ? (
        <EmptyState
          bordered
          title={t('No categories')}
          action={
            props.canManage ? (
              <Button size='sm' onClick={() => setFormTarget('create')}>
                {t('New category')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Name')}</TableHead>
              <TableHead>{t('Key')}</TableHead>
              <TableHead>{t('Disposition')}</TableHead>
              <TableHead>{t('Words')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              {props.canManage && (
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell>{category.name}</TableCell>
                <TableCell className='font-mono text-xs'>
                  {category.key}
                </TableCell>
                <TableCell>
                  {riskCategoryActionLabel(category.action, t)}
                </TableCell>
                <TableCell>{category.word_count}</TableCell>
                <TableCell>
                  {props.canManage ? (
                    <Switch
                      checked={category.status === RISK_CATEGORY_ENABLED}
                      disabled={updateMutation.isPending}
                      onCheckedChange={(enabled) =>
                        updateMutation.mutate({ category, enabled })
                      }
                      aria-label={t('Toggle category status')}
                    />
                  ) : (
                    t(
                      category.status === RISK_CATEGORY_ENABLED
                        ? 'Enabled'
                        : 'Disabled'
                    )
                  )}
                </TableCell>
                {props.canManage && (
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setFormTarget(category)}
                      >
                        {t('Edit')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setImportTarget(category)}
                      >
                        {t('Import')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        disabled={exportMutation.isPending}
                        onClick={() => exportMutation.mutate(category)}
                      >
                        {t('Export')}
                      </Button>
                      {category.key !== GENERAL_CATEGORY_KEY && (
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive'
                          onClick={() => setDeleteTarget(category)}
                        >
                          {t('Delete')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <CategoryFormDialog
        category={
          formTarget === 'create' ? undefined : (formTarget ?? undefined)
        }
        open={formTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFormTarget(null)
        }}
      />
      {importTarget && (
        <ImportWordsDialog
          category={importTarget}
          open
          onOpenChange={(open) => {
            if (!open) setImportTarget(null)
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('Delete category?')}
        desc={t(
          'This deletes the category "{{name}}" and its {{count}} words. This cannot be undone.',
          {
            name: deleteTarget?.name ?? '',
            count: deleteTarget?.word_count ?? 0,
          }
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
        }}
      />
    </div>
  )
}

function CategoryFormDialog(props: {
  category?: RiskWordCategory
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const id = useId()
  const isEdit = !!props.category
  const form = useForm<CategoryFormInput>({
    resolver: zodResolver(categorySchema),
    values: {
      key: props.category?.key ?? '',
      name: props.category?.name ?? '',
      action:
        (props.category?.action as CategoryFormInput['action']) ?? 'record',
      enabled: props.category?.status !== RISK_CATEGORY_DISABLED,
    },
  })
  const mutation = useMutation({
    mutationFn: (input: CategoryFormInput) =>
      isEdit && props.category
        ? updateRiskWordCategory(props.category.id, {
            name: input.name,
            action: input.action,
            status: input.enabled
              ? RISK_CATEGORY_ENABLED
              : RISK_CATEGORY_DISABLED,
            expected_version: props.category.version,
          })
        : createRiskWordCategory({
            key: input.key,
            name: input.name,
            action: input.action,
          }),
    onSuccess: () => {
      props.onOpenChange(false)
      toast.success(t('Saved successfully'))
      void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error(t('The record was changed by someone else. Reloaded.'))
        void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
        props.onOpenChange(false)
        return
      }
      handleServerError(error, t('Failed to save category'))
    },
  })
  const errors = form.formState.errors
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={isEdit ? t('Edit category') : t('New category')}
      description={t(
        'The key cannot be changed after creation. Words are managed by import and export.'
      )}
    >
      <form
        className='space-y-4'
        onSubmit={form.handleSubmit((input) => mutation.mutate(input))}
      >
        {!isEdit && (
          <div className='space-y-2'>
            <Label htmlFor={`${id}-key`}>{t('Key')}</Label>
            <Input
              id={`${id}-key`}
              {...form.register('key')}
              maxLength={32}
              aria-invalid={!!errors.key}
              aria-describedby={`${id}-key-help`}
              className='font-mono'
            />
            <p id={`${id}-key-help`} className='text-muted-foreground text-xs'>
              {t(
                '1 to 32 characters: lowercase letters, digits and underscores.'
              )}
            </p>
            {errors.key && (
              <p role='alert' className='text-destructive text-sm'>
                {t('Use 1 to 32 lowercase letters, digits or underscores.')}
              </p>
            )}
          </div>
        )}
        <div className='space-y-2'>
          <Label htmlFor={`${id}-name`}>{t('Name')}</Label>
          <Input
            id={`${id}-name`}
            {...form.register('name')}
            maxLength={64}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p role='alert' className='text-destructive text-sm'>
              {t('Enter a name between 1 and 64 characters.')}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <Label htmlFor={`${id}-action`}>{t('Disposition')}</Label>
          <Select
            items={[
              { value: 'record', label: t('Record only') },
              { value: 'block', label: t('Block requests') },
              { value: 'block_restrict', label: t('Block and restrict') },
            ]}
            value={form.watch('action')}
            onValueChange={(value) =>
              form.setValue(
                'action',
                (value ?? 'record') as CategoryFormInput['action'],
                { shouldDirty: true }
              )
            }
          >
            <SelectTrigger id={`${id}-action`} aria-label={t('Disposition')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='record'>{t('Record only')}</SelectItem>
              <SelectItem value='block'>{t('Block requests')}</SelectItem>
              <SelectItem value='block_restrict'>
                {t('Block and restrict')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isEdit && (
          <div className='flex items-center justify-between gap-3'>
            <Label htmlFor={`${id}-enabled`}>{t('Enabled')}</Label>
            <Switch
              id={`${id}-enabled`}
              checked={form.watch('enabled')}
              onCheckedChange={(checked) =>
                form.setValue('enabled', checked, { shouldDirty: true })
              }
            />
          </div>
        )}
        <Button type='submit' disabled={mutation.isPending}>
          {t('Save')}
        </Button>
      </form>
    </Dialog>
  )
}

type ImportStep =
  | { stage: 'pick' }
  | { stage: 'preview'; preview: RiskImportPreview; file: File }

function ImportWordsDialog(props: {
  category: RiskWordCategory
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const fileInputId = useId()
  const [step, setStep] = useState<ImportStep>({ stage: 'pick' })
  const [mode, setMode] = useState<RiskImportMode>('append')
  const [fileError, setFileError] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const previewMutation = useMutation({
    mutationFn: (file: File) => previewRiskWordImport(props.category.id, file),
    onSuccess: (preview, file) => {
      setStep({ stage: 'preview', preview, file })
    },
    onError: (error) => handleServerError(error, t('Failed to preview import')),
  })
  const commitMutation = useMutation({
    mutationFn: (input: { previewID: string; mode: RiskImportMode }) =>
      commitRiskWordImport(props.category.id, {
        preview_id: input.previewID,
        mode: input.mode,
        expected_version: props.category.version,
      }),
    onSuccess: (result) => {
      toast.success(
        t('Imported {{added}} new words ({{duplicate}} duplicates skipped).', {
          added: result?.added ?? 0,
          duplicate: result?.duplicate ?? 0,
        })
      )
      props.onOpenChange(false)
      void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        toast.error(t('The record was changed by someone else. Reloaded.'))
        void client.invalidateQueries({ queryKey: ['risk', 'categories'] })
        props.onOpenChange(false)
        return
      }
      handleServerError(error, t('Failed to import words'))
    },
  })
  const onFile = (file: File | undefined) => {
    setFileError(false)
    if (!file) return
    if (file.size > IMPORT_MAX_BYTES) {
      setFileError(true)
      return
    }
    previewMutation.mutate(file)
  }
  const preview = step.stage === 'preview' ? step.preview : null
  const submit = () => {
    if (!preview) return
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    commitMutation.mutate({ previewID: preview.preview_id, mode })
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Import words into "{{name}}"', { name: props.category.name })}
      description={t(
        'Upload a .txt file with one word per line. The file contents are never displayed.'
      )}
    >
      <div className='space-y-4'>
        {step.stage === 'pick' && (
          <div className='space-y-2'>
            <Label htmlFor={fileInputId}>{t('Word list file')}</Label>
            <Input
              id={fileInputId}
              type='file'
              accept='.txt,text/plain'
              disabled={previewMutation.isPending}
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <p className='text-muted-foreground text-xs'>
              {t('One word per line, UTF-8, at most 2 MB.')}
            </p>
            {fileError && (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t('The file exceeds the 2 MB limit.')}
                </AlertDescription>
              </Alert>
            )}
            {previewMutation.isPending && (
              <p role='status' className='text-muted-foreground text-sm'>
                {t('Loading...')}
              </p>
            )}
          </div>
        )}
        {preview && (
          <div className='space-y-4'>
            <dl className='grid grid-cols-2 gap-2 text-sm'>
              <dt className='text-muted-foreground'>{t('Total lines')}</dt>
              <dd>{preview.total}</dd>
              <dt className='text-muted-foreground'>{t('New words')}</dt>
              <dd>{preview.added}</dd>
              <dt className='text-muted-foreground'>{t('Duplicates')}</dt>
              <dd>{preview.duplicate}</dd>
              <dt className='text-muted-foreground'>{t('Invalid lines')}</dt>
              <dd>{preview.invalid}</dd>
            </dl>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as RiskImportMode)}
              aria-label={t('Import mode')}
            >
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='append' id='import-append' />
                <Label htmlFor='import-append'>
                  {t('Append: keep existing words and add the new ones')}
                </Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='replace' id='import-replace' />
                <Label htmlFor='import-replace'>
                  {t('Replace: overwrite all existing words')}
                </Label>
              </div>
            </RadioGroup>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => setStep({ stage: 'pick' })}
                disabled={commitMutation.isPending}
              >
                {t('Back')}
              </Button>
              <Button
                onClick={submit}
                disabled={commitMutation.isPending}
                variant={mode === 'replace' ? 'destructive' : 'default'}
              >
                {mode === 'replace' ? t('Replace words') : t('Append words')}
              </Button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title={t('Replace all words?')}
        desc={t(
          'The existing {{existing}} words will be replaced by {{incoming}} words.',
          {
            existing: props.category.word_count,
            incoming: preview ? preview.added + preview.duplicate : 0,
          }
        )}
        confirmText={t('Replace words')}
        destructive
        isLoading={commitMutation.isPending}
        handleConfirm={() =>
          preview &&
          commitMutation.mutate({
            previewID: preview.preview_id,
            mode: 'replace',
          })
        }
      />
    </Dialog>
  )
}
