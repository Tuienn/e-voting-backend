import { MerkleTree } from 'merkletreejs'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from '@noble/hashes/utils.js'

function sha256Buffer(data: Buffer | Uint8Array | string): Buffer {
    if (typeof data === 'string') {
        return Buffer.from(sha256(utf8ToBytes(data)))
    }

    return Buffer.from(sha256(data))
}

export function buildCommitmentMerkleTree(commitments: string[]) {
    const leaves = commitments.map((commitment) => sha256Buffer(commitment))

    const tree = new MerkleTree(leaves, sha256Buffer, {
        sortLeaves: true,
        sortPairs: true,
        duplicateOdd: true
    })

    const hexRoot = tree.getHexRoot()
    return {
        tree,
        root: hexRoot.startsWith('0x') ? hexRoot.slice(2) : hexRoot,
        leaves: leaves.map((leaf) => `0x${leaf.toString('hex')}`)
    }
}

export function verifyCommitmentProof(commitment: string, proof: string[], root: string) {
    const leaf = sha256Buffer(commitment)

    const tree = new MerkleTree([], sha256Buffer, {
        sortPairs: true
    })

    return tree.verify(proof, leaf, root)
}

export function computeCommitmentProof(commitments: string[], commitment: string) {
    const { tree } = buildCommitmentMerkleTree(commitments)

    const leaf = sha256Buffer(commitment)

    const hexRoot = tree.getHexRoot()
    return {
        root: hexRoot.startsWith('0x') ? hexRoot.slice(2) : hexRoot,
        leaf: `0x${leaf.toString('hex')}`,
        proof: tree.getHexProof(leaf)
    }
}
