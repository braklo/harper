/* SPDX-License-Identifier: Apache-2.0 */
#include "harperdict.h"

HarperDict::HarperDict(const QString &language, HarperSpeller *speller)
    : SpellerPlugin(language)
    , m_speller(speller)
{
}

HarperDict::~HarperDict()
{
    harper_sonnet_free(m_speller);
}

bool HarperDict::isCorrect(const QString &word) const
{
    const QByteArray utf8 = word.toUtf8();
    return harper_sonnet_is_correct(m_speller, reinterpret_cast<const uint8_t *>(utf8.constData()), utf8.size()) != 0;
}

QStringList HarperDict::suggest(const QString &word) const
{
    const QByteArray utf8 = word.toUtf8();
    size_t len = 0;
    uint8_t *out = harper_sonnet_suggest(m_speller, reinterpret_cast<const uint8_t *>(utf8.constData()), utf8.size(), &len);
    if (!out) {
        return {};
    }
    const QString joined = QString::fromUtf8(reinterpret_cast<const char *>(out), qsizetype(len));
    harper_sonnet_string_free(out, len);
    return joined.split(QLatin1Char('\n'), Qt::SkipEmptyParts);
}

bool HarperDict::storeReplacement(const QString &bad, const QString &good)
{
    Q_UNUSED(bad)
    Q_UNUSED(good)
    return false;
}

bool HarperDict::addToPersonal(const QString &word)
{
    const QByteArray utf8 = word.toUtf8();
    return harper_sonnet_add_personal(m_speller, reinterpret_cast<const uint8_t *>(utf8.constData()), utf8.size()) != 0;
}

bool HarperDict::addToSession(const QString &word)
{
    const QByteArray utf8 = word.toUtf8();
    return harper_sonnet_add_session(m_speller, reinterpret_cast<const uint8_t *>(utf8.constData()), utf8.size()) != 0;
}
