import { Container } from "typedi";
import { Service } from 'typedi';
import { RippleAPI, FormattedTransactionType } from "ripple-lib";
import { GetServerInfoResponse } from 'ripple-lib/dist/npm/common/serverinfo';
import { LoggerService } from "../services/LoggerService";
import { BadRequestError } from "routing-controllers";
import { User } from "../models/User";
import sleep from "../util/SleepUtil";
import { deriveAddress } from 'ripple-keypairs';
import { FormattedGetAccountInfoResponse } from "ripple-lib/dist/npm/ledger/accountinfo";
@Service()
export class RippleLibService {

    log = Container.get(LoggerService);
    rippleAPI: RippleAPI;

    public async init(): Promise<void> {
        this.rippleAPI = new RippleAPI({server: process.env.RIPPLE_SERVER});
        return this.rippleAPI.connect();
    }

    public getServerInfo(): Promise<GetServerInfoResponse> {
        this.log.info('Get ripple server info');
        return this.rippleAPI.getServerInfo();
    }

    public async getPayment(hash: string, retries?: number): Promise<FormattedTransactionType> {
        try {
            return await this.rippleAPI.getTransaction(hash);
        } catch {
            if (retries === undefined || retries < 20) {
                await sleep(500);
                return this.getPayment(hash, retries === undefined ? 1 : retries + 1);
            } else {
                this.log.error("Payment could not be found after 10 seconds");
                throw new BadRequestError("Payment could not be found");
            }
        }
    }
    
    public async getAccountInfo(user: User): Promise<FormattedGetAccountInfoResponse> {
        return this.rippleAPI.getAccountInfo(deriveAddress(user.publickey));
    }
}