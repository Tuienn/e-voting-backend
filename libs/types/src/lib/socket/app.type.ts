export type ElectionSubscription = {
    electionId: string
}

export type VoteCommittedPayload = {
    electionId: string
    blockchainRef: string
    createdAt: string
}

export type VoteRevealedPayload = {
    electionId: string
    candidateIds: string[]
    revealKey: string
    blockchainRef: string
    createdAt: string
    electionCompleted: boolean
}
