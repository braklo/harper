/* Sonnet client exposing Harper. SPDX-License-Identifier: Apache-2.0 */
#ifndef HARPERCLIENT_H
#define HARPERCLIENT_H

#include "client_p.h"

class HarperClient : public Sonnet::Client
{
    Q_OBJECT
    Q_INTERFACES(Sonnet::Client)
    Q_PLUGIN_METADATA(IID "org.kde.sonnet.Client")
public:
    explicit HarperClient(QObject *parent = nullptr);

    // Below Hunspell (40): Harper is used only when chosen explicitly with
    // defaultClient=Harper in ~/.config/KDE/Sonnet.conf (ADR-0016).
    int reliability() const override
    {
        return 30;
    }

    Sonnet::SpellerPlugin *createSpeller(const QString &language) override;
    QStringList languages() const override;
    QString name() const override
    {
        return QStringLiteral("Harper");
    }
};

#endif
