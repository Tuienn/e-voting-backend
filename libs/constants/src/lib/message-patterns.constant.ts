export const IDENTITY_MESSAGE_PATTERNS = {
    CREATE_USER: 'user.create_user',
    CREATE_BULK_USERS: 'user.create_bulk_users',
    DELETE_BULK_USERS: 'user.delete_bulk_users',
    GET_USER_BY_ID: 'user.get_user_by_id',
    DISABLE_USER_BY_ID: 'user.disable_user_by_id',
    ENABLE_USER_BY_ID: 'user.enable_user_by_id',
    DELETE_USER_BY_ID: 'user.delete_user_by_id',
    UPDATE_USER_BY_ID: 'user.update_user_by_id',
    FILTER_USERS: 'user.filter_users',
    GET_USERS_BY_IDS: 'user.GET_USERS_BY_IDS',

    SIGN_IN: 'auth.sign_in',
    REFRESH_TOKEN: 'auth.refresh_token',
    SIGN_OUT: 'auth.sign_out'
} as const

export const COORDINATOR_MESSAGE_PATTERNS = {
    FILTER_ELECTIONS: 'election.filter_elections',
    CREATE_ELECTION: 'election.create_election',
    START_ELECTION: 'election.start_election',
    END_ELECTION: 'election.end_election',
    COMPLETE_ELCTION: 'election.complete_election',
    GET_ELECTION_BY_ID: 'election.get_election_by_id',
    ADD_VOTERS_TO_ELECTION: 'election.add_voters_to_election',
    GET_VOTER_IN_ELECTION: 'election.get_voter_in_election',
    COLLECTIVE_PUBLIC_KEY: 'election.collective_public_key',

    START_SESSION: 'vote.start_vote_session',
    SIGN_BLINDED_VOTE: 'vote.sign_blinded_vote',
    SUBMIT_UNBLINDED_VOTE: 'vote.submit_unblinded_vote',
    GET_VOTE_BY_BLINDED_HASH: 'vote.get_vote_by_blinded_hash',
    UPDATE_REVEALED_STATUS: 'vote.update_revealed_status',
    CHECK_EXIST_UNREVEALED_VOTE: 'vote.check_exist_unrevealed_vote'
} as const

export const REVEAL_VOTE_MESSAGE_PATTERNS = {
    REVEAL_VOTE: 'reveal.reveal_vote'
} as const

export const SIGNING_NODE_MESSAGE_PATTERNS = {
    CREATE_COMMITMENT: 'signing_node.create_commitment',
    SIGN_PARTIAL: 'signing_node.sign_partial',
    GET_NODE_INFO: 'signing_node.get_node_info'
} as const
