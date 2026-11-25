const ANONYMIZED_ACCT = 'deleted';

interface ProfileLinkSource {
  acct?: string;
  suspended?: boolean;
}

export const profilePathOf = (
  account: ProfileLinkSource | null | undefined,
): string | null => {
  if (!account?.acct || account.acct === ANONYMIZED_ACCT || account.suspended) {
    return null;
  }

  return `/@${account.acct}`;
};
