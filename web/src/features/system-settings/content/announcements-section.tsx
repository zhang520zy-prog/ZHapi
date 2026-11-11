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
import { Plus, Trash2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { DateTimePicker } from '@/components/datetime-picker'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AnnouncementPopupDialog } from '@/features/announcements/announcement-popup'
import type { PopupAnnouncement } from '@/features/announcements/types'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type Announcement = {
  /** Server-assigned; absent on locally added rows (B6.1/F6.1). */
  id?: number
  /** Local-only row key; never serialized into the saved JSON. */
  localId: string
  title?: string
  content: string
  publishDate: string
  expireDate?: string
  popup?: boolean
  type: 'default' | 'ongoing' | 'success' | 'warning' | 'error'
  extra?: string
}

type AnnouncementsSectionProps = {
  enabled: boolean
  data: string
}

const announcementSchema = z
  .object({
    title: z
      .string()
      .max(60, 'Title must be less than 60 characters')
      .optional(),
    content: z
      .string()
      .min(1, 'Content is required')
      .max(2000, 'Content must be less than 2000 characters'),
    publishDate: z.string().min(1, 'Publish date is required'),
    expireDate: z.string().optional(),
    popup: z.boolean(),
    /** Form-only flag; stripped before save. */
    remindAgain: z.boolean(),
    type: z.enum(['default', 'ongoing', 'success', 'warning', 'error']),
    extra: z
      .string()
      .max(100, 'Extra must be less than 100 characters')
      .optional(),
  })
  .refine(
    (values) => {
      if (!values.expireDate) return true
      const published = Date.parse(values.publishDate)
      const expires = Date.parse(values.expireDate)
      return (
        Number.isFinite(published) &&
        Number.isFinite(expires) &&
        expires > published
      )
    },
    {
      message: 'Expiry must be later than the publish date',
      path: ['expireDate'],
    }
  )

type AnnouncementFormValues = z.infer<typeof announcementSchema>

const ANNOUNCEMENT_FORM_ID = 'announcement-form'

const typeOptions = [
  {
    value: 'default',
    label: 'Default',
    color: 'bg-neutral',
    badgeVariant: 'neutral' as const,
  },
  {
    value: 'ongoing',
    label: 'Ongoing',
    color: 'bg-info',
    badgeVariant: 'info' as const,
  },
  {
    value: 'success',
    label: 'Success',
    color: 'bg-success',
    badgeVariant: 'success' as const,
  },
  {
    value: 'warning',
    label: 'Warning',
    color: 'bg-warning',
    badgeVariant: 'warning' as const,
  },
  {
    value: 'error',
    label: 'Error',
    color: 'bg-destructive',
    badgeVariant: 'danger' as const,
  },
]

export function AnnouncementsSection({
  enabled,
  data,
}: AnnouncementsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption({ successToast: false })
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<Announcement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'batch'>('single')
  const [preview, setPreview] = useState<PopupAnnouncement[] | null>(null)

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: '',
      content: '',
      publishDate: new Date().toISOString(),
      expireDate: '',
      popup: false,
      remindAgain: false,
      type: 'default',
      extra: '',
    },
  })

  useEffect(() => {
    try {
      const parsed = JSON.parse(data || '[]')
      if (Array.isArray(parsed)) {
        setAnnouncements(
          parsed.map((item, idx) => ({
            ...item,
            localId:
              typeof item.id === 'number' ? `srv:${item.id}` : `row:${idx}`,
          }))
        )
        setSelectedIds([])
      }
    } catch {
      setAnnouncements([])
    }
  }, [data])

  useEffect(() => {
    setIsEnabled(enabled)
  }, [enabled])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.announcements_enabled',
        value: checked,
      })
      setIsEnabled(checked)
      toast.success(t('Setting saved'))
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  const handleAdd = () => {
    setEditingAnnouncement(null)
    form.reset({
      title: '',
      content: '',
      publishDate: new Date().toISOString(),
      expireDate: '',
      popup: false,
      remindAgain: false,
      type: 'default',
      extra: '',
    })
    setShowDialog(true)
  }

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    form.reset({
      title: announcement.title || '',
      content: announcement.content,
      publishDate: announcement.publishDate,
      expireDate: announcement.expireDate || '',
      popup: announcement.popup === true,
      remindAgain: false,
      type: announcement.type,
      extra: announcement.extra || '',
    })
    setShowDialog(true)
  }

  const handleDelete = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setDeleteTarget('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Please select items to delete'))
      return
    }
    setDeleteTarget('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (deleteTarget === 'single' && editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.filter((item) => item.localId !== editingAnnouncement.localId)
      )
      setHasChanges(true)
      toast.success(t('Announcement deleted. Click "Save Settings" to apply.'))
    } else if (deleteTarget === 'batch') {
      setAnnouncements((prev) =>
        prev.filter((item) => !selectedIds.includes(item.localId))
      )
      setSelectedIds([])
      setHasChanges(true)
      toast.success(
        t('{{count}} announcements deleted. Click "Save Settings" to apply.', {
          count: selectedIds.length,
        })
      )
    }
    setShowDeleteDialog(false)
    setEditingAnnouncement(null)
  }

  const handleSubmitForm = (values: AnnouncementFormValues) => {
    const { remindAgain, ...fields } = values
    if (editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.map((item) =>
          item.localId === editingAnnouncement.localId
            ? {
                ...item,
                ...fields,
                // Remind-again: drop the server id so the backend assigns a
                // fresh one and every account sees the popup once more.
                id: remindAgain ? undefined : item.id,
                localId: remindAgain
                  ? `local:${crypto.randomUUID()}`
                  : item.localId,
              }
            : item
        )
      )
      toast.success(t('Announcement updated. Click "Save Settings" to apply.'))
    } else {
      setAnnouncements((prev) => [
        ...prev,
        { localId: `local:${crypto.randomUUID()}`, ...fields },
      ])
      toast.success(t('Announcement added. Click "Save Settings" to apply.'))
    }
    setHasChanges(true)
    setShowDialog(false)
  }

  const handleSaveAll = async () => {
    try {
      const payload = announcements.map(({ localId: _localId, ...item }) => {
        const { id, title, expireDate, ...rest } = item
        const entry: Record<string, unknown> = { ...rest }
        // Only server-assigned ids go out; new rows carry no id (B6.1 audit).
        if (id !== undefined) entry.id = id
        if (title?.trim()) entry.title = title.trim()
        if (expireDate) entry.expireDate = expireDate
        return entry
      })
      await updateOption.mutateAsync({
        key: 'console_setting.announcements',
        value: JSON.stringify(payload),
      })
      setHasChanges(false)
      toast.success(
        t(
          'Saved. Popup announcements will be shown the next time each user enters the console.'
        )
      )
    } catch (error) {
      handleServerError(error, t('Failed to save announcements'))
    }
  }

  const handlePreview = () => {
    const values = form.getValues()
    setPreview([
      {
        title: values.title?.trim() || undefined,
        content: values.content,
        publishDate: values.publishDate,
        expireDate: values.expireDate || undefined,
        popup: true,
        type: values.type,
        extra: values.extra,
      },
    ])
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? announcements.map((item) => item.localId) : [])
  }

  const toggleSelectOne = (localId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, localId] : prev.filter((item) => item !== localId)
    )
  }

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      return (
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      )
    })
  }, [announcements])

  const getRelativeTime = (date: string) => dayjs(date).fromNow()

  return (
    <SettingsSection title={t('Announcements')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleAdd} size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add Announcement')}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size='sm'
              variant='destructive'
              disabled={selectedIds.length === 0}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              {t('Delete (')}
              {selectedIds.length})
            </Button>
            <Button
              onClick={handleSaveAll}
              size='sm'
              variant='secondary'
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save className='mr-2 h-4 w-4' />
              {updateOption.isPending ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
          <SettingsSwitchField
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            label={t('Enabled')}
            className='py-0'
          />
        </div>

        <StaticDataTable
          data={sortedAnnouncements}
          getRowKey={(announcement) => announcement.localId}
          emptyContent={t(
            'No announcements yet. Click "Add Announcement" to create one.'
          )}
          columns={[
            {
              id: 'select',
              header: (
                <Checkbox
                  checked={
                    selectedIds.length === announcements.length &&
                    announcements.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              ),
              className: 'w-12',
              cell: (announcement) => (
                <Checkbox
                  checked={selectedIds.includes(announcement.localId)}
                  onCheckedChange={(checked) =>
                    toggleSelectOne(announcement.localId, checked as boolean)
                  }
                />
              ),
            },
            {
              id: 'content',
              header: t('Content'),
              cellClassName: 'max-w-xs',
              cell: (announcement) => (
                <div className='flex min-w-0 flex-col gap-0.5'>
                  {announcement.title?.trim() ? (
                    <span className='truncate font-medium'>
                      {announcement.title}
                    </span>
                  ) : null}
                  <span className='truncate'>{announcement.content}</span>
                </div>
              ),
            },
            {
              id: 'publish-date',
              header: t('Publish Date'),
              cell: (announcement) => (
                <div className='flex flex-col gap-1'>
                  <span className='text-sm font-medium'>
                    {getRelativeTime(announcement.publishDate)}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {dayjs(announcement.publishDate).format(
                      'YYYY-MM-DD HH:mm:ss'
                    )}
                  </span>
                </div>
              ),
            },
            {
              id: 'type',
              header: t('Type'),
              cell: (announcement) => {
                const typeOption = typeOptions.find(
                  (opt) => opt.value === announcement.type
                )
                const scheduled =
                  Date.parse(announcement.publishDate) > Date.now()
                const expired =
                  !!announcement.expireDate &&
                  Date.parse(announcement.expireDate) <= Date.now()
                return (
                  <div className='flex flex-wrap items-center gap-1'>
                    <StatusBadge
                      label={typeOption ? t(typeOption.label) : undefined}
                      variant={typeOption?.badgeVariant ?? 'neutral'}
                      copyable={false}
                    />
                    {announcement.popup ? (
                      <StatusBadge
                        label={t('Popup')}
                        variant='info'
                        copyable={false}
                      />
                    ) : null}
                    {scheduled ? (
                      <StatusBadge
                        label={t('Scheduled')}
                        variant='warning'
                        copyable={false}
                      />
                    ) : null}
                    {expired ? (
                      <StatusBadge
                        label={t('Expired')}
                        variant='neutral'
                        copyable={false}
                      />
                    ) : null}
                  </div>
                )
              },
            },
            {
              id: 'extra',
              header: t('Extra'),
              cellClassName: 'text-muted-foreground max-w-xs truncate',
              cell: (announcement) => announcement.extra || '-',
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (announcement) => (
                <StaticRowActions
                  editLabel={t('Edit')}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  onEdit={() => handleEdit(announcement)}
                  onDelete={() => handleDelete(announcement)}
                />
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title={
          editingAnnouncement ? t('Edit Announcement') : t('Add Announcement')
        }
        description={t(
          'Create or update system announcements for the dashboard'
        )}
        contentClassName='max-w-2xl'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' variant='outline' onClick={handlePreview}>
              {t('Preview')}
            </Button>
            <Button type='submit' form={ANNOUNCEMENT_FORM_ID}>
              {editingAnnouncement ? t('Update') : t('Add')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={ANNOUNCEMENT_FORM_ID}
            onSubmit={form.handleSubmit(handleSubmitForm)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Title (Optional)')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'Shown as the popup title (max 60 characters)'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='popup'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between gap-4'>
                    <FormLabel>{t('Popup on console entry')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormDescription>
                    {t(
                      'When enabled, this announcement pops up once per account when a user enters the console.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='content'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Content')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t(
                        'Enter announcement content (supports Markdown/HTML)'
                      )}
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('{{count}}/2000 characters', {
                      count: field.value?.length ?? 0,
                    })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='publishDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Publish Date')}</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      placeholder={t('Select publish date')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Date and time when this announcement should be displayed'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='expireDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Expiry (Optional)')}</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      placeholder={t('No expiry')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'After expiry the popup no longer shows, but the announcement stays in the list.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {editingAnnouncement?.popup === true ? (
              <FormField
                control={form.control}
                name='remindAgain'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center gap-2'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className='!mt-0'>
                        {t('Remind again')}
                      </FormLabel>
                    </div>
                    <FormDescription>
                      {t(
                        'When checked and saved, this announcement pops up again for every user as a new announcement.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Type')}</FormLabel>
                  <Select
                    items={typeOptions.map((option) => ({
                      value: option.value,
                      label: (
                        <div className='flex items-center gap-2'>
                          <div
                            className={`h-3 w-3 rounded-full ${option.color}`}
                          />
                          {t(option.label)}
                        </div>
                      ),
                    }))}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('Select announcement type')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {typeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className='flex items-center gap-2'>
                              <div
                                className={`h-3 w-3 rounded-full ${option.color}`}
                              />
                              {t(option.label)}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='extra'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Extra Notes (Optional)')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('Additional information')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Optional supplementary information (max 100 characters)'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog>

      <AnnouncementPopupDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        items={preview ?? []}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single'
                ? t('This announcement will be removed from the list.')
                : t('{{count}} announcements will be removed from the list.', {
                    count: selectedIds.length,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={confirmDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
