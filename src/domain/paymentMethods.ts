import { PaymentMethod, PaymentMethodType } from './types';

export const BUILTIN_CASH_ID = 'method_cash_default';
export const BUILTIN_BKASH_ID = 'method_bkash_default';
export const BUILTIN_NAGAD_ID = 'method_nagad_default';
export const MAX_CUSTOM_METHODS = 10;
export const MAX_TOTAL_METHODS = 13; // 3 core + 10 custom

export function createDefaultPaymentMethods(): PaymentMethod[] {
  const now = new Date().toISOString();
  return [
    {
      id: BUILTIN_CASH_ID,
      name: 'Cash',
      type: 'cash',
      isBuiltIn: true,
      isActive: true,
      balance: 0,
      openingBalance: 0,
      createdAt: now,
      updatedAt: now,
      legacyNames: ['cash', 'Cash']
    },
    {
      id: BUILTIN_BKASH_ID,
      name: 'bKash',
      type: 'mobile_money',
      isBuiltIn: false,
      isActive: true,
      balance: 0,
      openingBalance: 0,
      createdAt: now,
      updatedAt: now,
      legacyNames: ['bkash', 'bKash']
    },
    {
      id: BUILTIN_NAGAD_ID,
      name: 'Nagad',
      type: 'mobile_money',
      isBuiltIn: false,
      isActive: true,
      balance: 0,
      openingBalance: 0,
      createdAt: now,
      updatedAt: now,
      legacyNames: ['nagad', 'Nagad']
    }
  ];
}

/**
 * Resolves duplicate names automatically:
 * If "City Bank" exists, returns "City Bank~2". If that exists, "City Bank~3", etc.
 */
export function resolveDuplicateMethodName(
  baseName: string,
  existingMethods: PaymentMethod[],
  excludeMethodId?: string
): string {
  const trimmed = baseName.trim();
  const lowerBase = trimmed.toLowerCase();

  // Find all existing methods matching base or base~N
  const matchingSuffixes: number[] = [];

  existingMethods
    .filter((m) => m.id !== excludeMethodId)
    .forEach((m) => {
      const existingLower = m.name.trim().toLowerCase();
      if (existingLower === lowerBase) {
        matchingSuffixes.push(1);
      } else {
        const regex = new RegExp(`^${escapeRegex(lowerBase)}~(\\d+)$`);
        const match = existingLower.match(regex);
        if (match) {
          matchingSuffixes.push(parseInt(match[1], 10));
        }
      }
    });

  if (matchingSuffixes.length === 0) {
    return trimmed;
  }

  // Find next available suffix
  const maxSuffix = Math.max(...matchingSuffixes);
  return `${trimmed}~${maxSuffix + 1}`;
}

function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves a legacy payment method string (e.g. 'Cash', 'bkash', 'nagad') to a method in the registry.
 */
export function resolveMethodByLegacyName(
  legacyName: string,
  methods: PaymentMethod[]
): PaymentMethod | undefined {
  if (!legacyName) return undefined;
  const clean = legacyName.trim().toLowerCase();

  return methods.find((m) => {
    if (m.name.trim().toLowerCase() === clean) return true;
    if (m.legacyNames && m.legacyNames.some((l) => l.trim().toLowerCase() === clean)) return true;
    return false;
  });
}

/**
 * Returns the default payment method for all input forms, strictly defaulting to 'Cash'.
 * Users can still change it freely from their available payment methods list.
 */
export function getDefaultCashMethod(methods: PaymentMethod[] = []): PaymentMethod | undefined {
  if (!methods || methods.length === 0) return undefined;
  return (
    methods.find((m) => m.type === 'cash' || m.id === BUILTIN_CASH_ID || m.id === 'cash' || m.name.trim().toLowerCase() === 'cash') ||
    methods.find((m) => m.name.trim().toLowerCase().includes('cash')) ||
    methods[0]
  );
}

/**
 * Returns the default payment method ID for all input forms, strictly defaulting to Cash.
 */
export function getDefaultCashMethodId(methods: PaymentMethod[] = []): string {
  const method = getDefaultCashMethod(methods);
  return method?.id || BUILTIN_CASH_ID;
}
