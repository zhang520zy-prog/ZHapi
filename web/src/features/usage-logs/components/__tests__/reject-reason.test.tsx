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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'

const queryClients: QueryClient[] = []

function makeLog(other: LogOtherData): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type: 5,
    content: 'request rejected',
    username: 'user',
    token_name: 'token',
    model_name: 'gpt-test',
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 1,
    channel_name: 'channel',
    token_id: 1,
    group: 'default',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'req-1',
    upstream_request_id: '',
  }
}

function renderDetails(
  isAdmin: boolean,
  log = makeLog({
    admin_info: { reject_reason: 'blocked by channel policy' },
  })
): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const freshAt = Date.now() + 60_000
  queryClient.setQueryData(['status'], {}, { updatedAt: freshAt })
  queryClients.push(queryClient)

  render(
    <QueryClientProvider client={queryClient}>
      <DetailsDialog
        log={log}
        isAdmin={isAdmin}
        isRoot={false}
        open
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const queryClient of queryClients) {
    queryClient.clear()
  }
  queryClients.length = 0
})

describe('content policy rejection details', () => {
  function blockedLog(): UsageLog {
    return {
      ...makeLog({
        policy_event: 'request_blocked',
        policy_reason: 'sensitive_keyword',
        policy_action: 'block',
        policy_retryable: false,
        policy_upstream_called: false,
        status_code: 422,
        error_code: 'sensitive_words_detected',
        admin_info: {
          policy_rule_count: 1,
          reject_reason: 'private moderation diagnostic',
        },
      }),
      content: 'private request content',
      ip: '192.0.2.10',
      token_name: 'private-token-label',
    }
  }

  test('explains that detection stops at the first match to admins', () => {
    renderDetails(true, blockedLog())

    expect(screen.getByText('Detected matches')).toBeVisible()
    expect(
      screen.getByText(
        'Detection stops at the first match; this is not a count of all matching rules.'
      )
    ).toBeVisible()
  })

  test('gives users the rejection outcome without admin diagnostics', () => {
    renderDetails(false, blockedLog())

    expect(screen.getByText('Policy block')).toBeVisible()
    expect(
      screen.getByText(
        'Request was blocked before upstream processing. No model call or charge was made.'
      )
    ).toBeVisible()
    expect(
      screen.getByText('Blocked by a sensitive keyword rule')
    ).toBeVisible()
    expect(screen.queryByText('Detected matches')).not.toBeInTheDocument()
    expect(
      screen.queryByText('private moderation diagnostic')
    ).not.toBeInTheDocument()
  })

  test.each([false, true])(
    'copies only the support fields regardless of admin access (%s)',
    async (isAdmin) => {
      const user = userEvent.setup()
      const copy = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue()
      renderDetails(isAdmin, blockedLog())

      await user.click(
        screen.getByRole('button', { name: 'Copy support summary' })
      )

      expect(copy).toHaveBeenCalledExactlyOnceWith(
        'Request ID: req-1\nModel: gpt-test\nStatus: 422\nError code: sensitive_words_detected\nPolicy: Blocked by a sensitive keyword rule'
      )
    }
  )
})

describe('usage log reject reason', () => {
  test('shows the nested admin reject reason to admins', () => {
    renderDetails(true)

    expect(screen.getByText('Reject Reason')).toBeInTheDocument()
    expect(screen.getByText('blocked by channel policy')).toBeInTheDocument()
  })

  test('hides the nested admin reject reason from non-admin users', () => {
    renderDetails(false)

    expect(screen.queryByText('Reject Reason')).toBeNull()
    expect(screen.queryByText('blocked by channel policy')).toBeNull()
  })
})
