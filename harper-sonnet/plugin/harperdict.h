/* SPDX-License-Identifier: Apache-2.0 */
#ifndef HARPERDICT_H
#define HARPERDICT_H

#include "harper_sonnet.h"
#include "spellerplugin_p.h"

class HarperDict : public Sonnet::SpellerPlugin
{
public:
    HarperDict(const QString &language, HarperSpeller *speller);
    ~HarperDict() override;

    bool isCorrect(const QString &word) const override;
    QStringList suggest(const QString &word) const override;
    bool storeReplacement(const QString &bad, const QString &good) override;
    bool addToPersonal(const QString &word) override;
    bool addToSession(const QString &word) override;

private:
    HarperSpeller *m_speller;
};

#endif
