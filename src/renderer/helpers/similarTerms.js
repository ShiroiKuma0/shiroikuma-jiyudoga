// Term model behind the Similar tab's "less like this" button.
//
// Rejecting a video teaches the active profile the words that video was made of,
// so later recommendations phrased the same way can be filtered out. Titles here
// are mostly Japanese, where whitespace tokenisation gives nothing, so CJK runs
// are cut into character bigrams (the standard tokeniser-free approach) while
// Latin/digit runs are split into words.

// Bigrams are noisy on their own, so a single rejection must never hide anything:
// a candidate is only hidden once several of its terms match and those terms have
// been rejected repeatedly.
const MIN_MATCHED_TERMS = 2
const MIN_MATCHED_WEIGHT = 3

// Cap per title so one long title can't dominate the learned model
const MAX_TERMS_PER_TITLE = 24

// Iteration marks, hiragana, katakana (incl. the long vowel mark), CJK ideographs
const CJK_CHARACTER = /[々〆぀-ヿ㐀-䶿一-鿿豈-﫿]/
const WORD_CHARACTER = /[\p{Letter}\p{Number}]/u

/**
 * Splits one string into comparable terms: character bigrams for CJK runs,
 * whole words (length >= 2) for everything else. Runs are cut at every script
 * transition as well, so a mixed title yields the Latin word and the bigrams
 * separately instead of one meaningless blob.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const terms = []
  let run = ''
  let runIsCjk = false

  function flush() {
    if (run === '') { return }

    if (runIsCjk) {
      if (run.length === 1) {
        terms.push(run)
      } else {
        for (let index = 0; index < run.length - 1; index++) {
          terms.push(run.slice(index, index + 2))
        }
      }
    } else if (run.length >= 2) {
      terms.push(run)
    }

    run = ''
  }

  for (const character of text) {
    const characterIsCjk = CJK_CHARACTER.test(character)

    if (!characterIsCjk && !WORD_CHARACTER.test(character)) {
      flush()
      continue
    }

    if (run !== '' && characterIsCjk !== runIsCjk) {
      flush()
    }

    runIsCjk = characterIsCjk
    run += character
  }

  flush()

  return terms
}

/**
 * The terms one video is described by: its title plus its channel name, so
 * rejecting a video also teaches a little about who made it.
 * @param {string} title
 * @param {string} [author]
 * @returns {string[]} deduplicated terms
 */
export function extractTerms(title, author) {
  const normalized = `${title ?? ''} ${author ?? ''}`.normalize('NFKC').toLowerCase()

  return Array.from(new Set(tokenize(normalized))).slice(0, MAX_TERMS_PER_TITLE)
}

/**
 * @param {string[]} terms terms of the candidate video
 * @param {Map<string, number>} negativeTermWeights learned term -> weight
 * @returns {{ matchedCount: number, matchedWeight: number }}
 */
export function matchNegativeTerms(terms, negativeTermWeights) {
  let matchedCount = 0
  let matchedWeight = 0

  for (const term of terms) {
    const weight = negativeTermWeights.get(term)

    if (weight) {
      matchedCount++
      matchedWeight += weight
    }
  }

  return { matchedCount, matchedWeight }
}

/**
 * @param {{ matchedCount: number, matchedWeight: number }} match
 */
export function shouldHideForTerms({ matchedCount, matchedWeight }) {
  return matchedCount >= MIN_MATCHED_TERMS && matchedWeight >= MIN_MATCHED_WEIGHT
}

/**
 * Turns the stored `[{ term, weight }]` array into the lookup used while filtering.
 * @param {{ term: string, weight: number }[]} negativeTerms
 * @returns {Map<string, number>}
 */
export function negativeTermMap(negativeTerms) {
  const map = new Map()

  for (const { term, weight } of negativeTerms) {
    map.set(term, weight)
  }

  return map
}
