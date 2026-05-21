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
    GET_USERS_BY_IDS: 'user.get_users_by_ids',

    SIGN_IN: 'auth.sign_in',
    REFRESH_TOKEN: 'auth.refresh_token',
    SIGN_OUT: 'auth.sign_out'
} as const

export const COORDINATOR_MESSAGE_PATTERNS = {
    FILTER_ELECTIONS: 'election.filter_elections',
    CREATE_ELECTION: 'election.create_election',
    ADD_CANDIDATES_TO_ELECTION: 'election.add_candidates_to_election',
    DELETE_CANDIDATES_FROM_ELECTION: 'election.delete_candidates_from_election',
    START_ELECTION: 'election.start_election',
    END_ELECTION: 'election.end_election',
    COMPLETE_ELECTION: 'election.complete_election',
    GET_ELECTION_BY_ID: 'election.get_election_by_id',
    ADD_VOTERS_TO_ELECTION: 'election.add_voters_to_election',
    DELETE_VOTERS_FROM_ELECTION: 'election.delete_voters_from_election',
    GET_VOTER_IN_ELECTION: 'election.get_voter_in_election',
    GET_ELECTIONS_BY_VOTER_ID: 'election.get_elections_by_voter_id',
    GET_ELECTIONS_BY_CANDIDATE_ID: 'election.get_elections_by_candidate_id',

    START_SESSION: 'vote.start_vote_session',
    SIGN_BLINDED_VOTE: 'vote.sign_blinded_vote',
    SUBMIT_BLINDED_COMMITMENT: 'vote.submit_blinded_commitment',
    GET_VOTE_COUNT: 'vote.get_vote_count',
    VERIFY_VOTE: 'vote.verify_vote'
} as const

export const REVEAL_VOTE_MESSAGE_PATTERNS = {
    REVEAL_VOTE: 'reveal.reveal_vote'
} as const

export const SIGNING_NODE_MESSAGE_PATTERNS = {
    GENERATE_KEY_PAIR: 'signing_node.generate_key_pair',
    CREATE_COMMITMENT: 'signing_node.create_commitment',
    DELETE_SESSION_NONCE: 'signing_node.delete_session_nonce',
    SIGN_PARTIAL: 'signing_node.sign_partial',
    CLEANUP_ELECTION: 'signing_node.cleanup_election'
} as const
