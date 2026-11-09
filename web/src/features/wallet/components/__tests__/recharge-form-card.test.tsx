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
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import type { TopupInfo } from '../../types'
import { RechargeFormCard } from '../recharge-form-card'

// The backend sets `enable_redemption` to the payment-compliance flag, so
// it returns true on every compliant deployment. The input must instead
// follow the sidebar_modules admin switch (H-1).
const topupInfo: TopupInfo = {
  enable_online_topup: false,
  enable_stripe_topup: false,
  pay_methods: [],
  min_topup: 0,
  stripe_min_topup: 0,
  amount_options: [],
  discount: {},
  enable_redemption: true,
  payment_compliance_confirmed: true,
}

const requiredProps = {
  topupInfo,
  presetAmounts: [],
  selectedPreset: null,
  onSelectPreset: vi.fn(),
  topupAmount: 0,
  onTopupAmountChange: vi.fn(),
  paymentAmount: 0,
  calculating: false,
  onPaymentMethodSelect: vi.fn(),
  paymentLoading: null,
  redemptionCode: '',
  onRedemptionCodeChange: vi.fn(),
  onRedeem: vi.fn(),
  redeeming: false,
}

function renderCard(sidebarModulesAdmin: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    SidebarModulesAdmin: sidebarModulesAdmin,
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    role: 1,
    permissions: {},
    sidebar_modules: '',
  })
  function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    )
  }
  return render(
    <Wrapper>
      <RechargeFormCard {...requiredProps} />
    </Wrapper>
  )
}

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
})

describe('wallet redemption input visibility', () => {
  it('hides the redemption input when enable_redemption is true but the sidebar module is off', () => {
    renderCard('')

    expect(
      screen.queryByPlaceholderText('Enter your redemption code')
    ).not.toBeInTheDocument()
  })

  it('renders no redemption hint when the sidebar module is off (H-2)', () => {
    renderCard('')

    expect(
      screen.queryByText(/Redemption codes are disabled/i)
    ).not.toBeInTheDocument()
  })

  it('shows the redemption input when the admin enables the redemption sidebar module', () => {
    renderCard(JSON.stringify({ admin: { redemption: true } }))

    expect(
      screen.getByPlaceholderText('Enter your redemption code')
    ).toBeInTheDocument()
  })
})
