import type { KwilWrapper } from "../kwil-wrapper";
import Grant, { DEFAULT_RECORDS_PER_PAGE } from "./grant";

interface InitParams {
  nodeUrl?: string;
  dbId?: string;
}

export class _Grants {
  kwilWrapper: KwilWrapper;

  constructor(params: InitParams & { kwilWrapper: KwilWrapper }) {
    this.kwilWrapper = params.kwilWrapper;
  }

  async listGrantedGrants(
    page: number,
    size?: number,
  ): Promise<{ grants: Grant[]; totalCount: number }> {
    return this.getGrantsGranted(page, size);
  }

  async getGrantsGrantedCount(): Promise<number> {
    const response = (await this.kwilWrapper.call(
      "get_access_grants_granted_count",
      null,
    )) as unknown as {
      count: number;
    }[];
    return response[0].count;
  }

  mapToGrant(grant: any): Grant {
    return new Grant({
      id: grant.id,
      ownerUserId: grant.ag_owner_user_id,
      granteeAddress: grant.ag_grantee_wallet_identifier,
      dataId: grant.data_id,
      lockedUntil: grant.locked_until,
      ownerAddress: "",
    });
  }

  async getGrantsOwned(): Promise<{ grants: Grant[] }> {
    const list = (await this.kwilWrapper.call("get_access_grants_owned", null)) as any;
    const grants = list.map(this.mapToGrant);
    return {
      grants,
    };
  }

  async getGrantsGranted(
    page: number,
    size = DEFAULT_RECORDS_PER_PAGE,
  ): Promise<{ grants: Grant[]; totalCount: number }> {
    if (!page) throw new Error("paging starts from 1");
    const list = (await this.kwilWrapper.call("get_access_grants_granted", { page, size })) as any;
    const totalCount = await this.getGrantsGrantedCount();

    const grants = list.map(this.mapToGrant);
    return {
      grants,
      totalCount,
    };
  }

  async revokeGrant(grantId: string) {
    return this.kwilWrapper.execute("revoke_access_grant", [{ id: grantId }]);
  }

  async hasLockedGrants(credentialId: string) {
    const result = (await this.kwilWrapper.call("has_locked_access_grants", {
      id: credentialId,
    })) as unknown as [{ has: boolean }];
    return result[0]?.has;
  }
}
