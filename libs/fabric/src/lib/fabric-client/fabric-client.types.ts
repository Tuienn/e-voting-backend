export type FabricClientModuleOptions = {
    baseURL: string
    username: string
    password: string
    chaincodeId: string
    channelName: string
    orgId: string
}

export type InvokeChaincodeResponse = {
    status: string
    message: string
    result: {
        transactionId: string
        blockNumber: number
        code: number
        result: string
    }
}

export type QueryChaincodeResponse = {
    status?: string
    message: string
    result: string
}
