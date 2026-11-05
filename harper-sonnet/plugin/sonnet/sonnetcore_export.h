/*
 * Minimal stand-in for the generated sonnetcore_export.h of KF6 Sonnet.
 * The plugin only imports symbols from libKF6SonnetCore, so default
 * visibility is all it needs.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#ifndef SONNETCORE_EXPORT_H
#define SONNETCORE_EXPORT_H
#define SONNETCORE_EXPORT __attribute__((visibility("default")))
#endif
