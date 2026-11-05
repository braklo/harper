/* SPDX-License-Identifier: Apache-2.0 */
#include "harperclient.h"
#include "harperdict.h"

HarperClient::HarperClient(QObject *parent)
    : Client(parent)
{
}

QStringList HarperClient::languages() const
{
    // Language codes as Sonnet (and Hunspell dictionary names) spell them.
    return {QStringLiteral("sk_SK"),
            QStringLiteral("en_US"),
            QStringLiteral("en_GB"),
            QStringLiteral("en_CA"),
            QStringLiteral("en_AU"),
            QStringLiteral("en_IN"),
            QStringLiteral("de_DE"),
            QStringLiteral("de_AT"),
            QStringLiteral("de_CH")};
}

Sonnet::SpellerPlugin *HarperClient::createSpeller(const QString &language)
{
    HarperSpeller *speller = harper_sonnet_new(language.toUtf8().constData());
    if (!speller) {
        return nullptr;
    }
    return new HarperDict(language, speller);
}
