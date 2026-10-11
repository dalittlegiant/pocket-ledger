import { create } from 'zustand'

export interface TxnPrefill {
  amount: string // e.g. "68.00" — pre-filled into the sheet's amount input
  note: string // e.g. "Starbucks"
  kind: 'expense' | 'income' // extracted from the SMS (refunds → income)
}

interface UIState {
  isAddTxnModalOpen: boolean
  /** When set, the sheet opens in edit mode for this transaction. */
  editingTxnId: number | null
  openAddTxn: () => void
  openEditTxn: (id: number) => void
  closeAddTxn: () => void
  /** One-shot prefill for the sheet (e.g. from the iOS Shortcuts SMS bridge). */
  txnPrefill: TxnPrefill | null
  setTxnPrefill: (p: TxnPrefill | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  isAddTxnModalOpen: false,
  editingTxnId: null,
  openAddTxn: () => set({ isAddTxnModalOpen: true, editingTxnId: null }),
  openEditTxn: (editingTxnId) => set({ isAddTxnModalOpen: true, editingTxnId }),
  closeAddTxn: () => set({ isAddTxnModalOpen: false, editingTxnId: null }),
  txnPrefill: null,
  setTxnPrefill: (txnPrefill) => set({ txnPrefill }),
}))
