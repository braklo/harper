/* C ABI of the harper-sonnet Rust crate (src/lib.rs). SPDX-License-Identifier: Apache-2.0 */
#ifndef HARPER_SONNET_H
#define HARPER_SONNET_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct HarperSpeller HarperSpeller;
HarperSpeller *harper_sonnet_new(const char *language);
void harper_sonnet_free(HarperSpeller *speller);
int harper_sonnet_is_ready(const HarperSpeller *speller);
int harper_sonnet_is_correct(const HarperSpeller *speller, const uint8_t *word, size_t len);
uint8_t *harper_sonnet_suggest(const HarperSpeller *speller, const uint8_t *word, size_t len, size_t *out_len);
void harper_sonnet_string_free(uint8_t *ptr, size_t len);
int harper_sonnet_add_personal(const HarperSpeller *speller, const uint8_t *word, size_t len);
int harper_sonnet_add_session(const HarperSpeller *speller, const uint8_t *word, size_t len);
#ifdef __cplusplus
}
#endif
#endif
