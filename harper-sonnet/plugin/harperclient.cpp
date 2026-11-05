/* SPDX-License-Identifier: Apache-2.0 */
#include "harperclient.h"
#include "harperdict.h"

HarperClient::HarperClient(QObject *parent)
    : Client(parent)
{
}

QStringList HarperClient::languages() const
{
    // Only languages Sonnet has trigrams for. For any other code (en_GB,
    // de_AT, ...) Sonnet's language guessing asks the spellers themselves,
    // which would make every KDE application load that Harper dictionary.
    // Those codes stay with Hunspell.
    return {QStringLiteral("sk_SK"), QStringLiteral("en_US"), QStringLiteral("de_DE")};
}

Sonnet::SpellerPlugin *HarperClient::createSpeller(const QString &language)
{
    HarperSpeller *speller = harper_sonnet_new(language.toUtf8().constData());
    if (!speller) {
        return nullptr;
    }
    return new HarperDict(language, speller);
}
