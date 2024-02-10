import { CommonModule } from '@angular/common';
import { Component, DoCheck, Input, booleanAttribute } from '@angular/core';
import { BanInfo, MatchInfo, PlayerInfo } from '../../../models';
import { DataService } from '../../../services/data.service';
import { SteamService } from '../../../services/steam.service';
import { UtilsService } from '../../../services/utils.service';

@Component({
  selector: 'cs2-history-ban-scanner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ban-scanner.component.html',
  styleUrl: './ban-scanner.component.scss',
})
export class ScannerComponent implements DoCheck {
  @Input({ transform: booleanAttribute }) isOnGCPDSection = false;

  error = '';

  get isLoadingHistory(): boolean {
    return this._utilsService.isLoadingHistory;
  }

  get isScanning(): boolean {
    return this._utilsService.isScanning;
  }

  get matches(): MatchInfo[] {
    return this._dataService.matches;
  }

  get players(): PlayerInfo[] {
    return this._dataService.players;
  }

  get playersNotScannedYet(): PlayerInfo[] {
    return this._dataService.playersNotScannedYet;
  }

  get oldestScan(): BanInfo | undefined {
    return this._dataService.oldestScan;
  }

  get oldestMatch(): MatchInfo | undefined {
    return this._dataService.oldestMatch;
  }

  showNewPlayersBannedWarning?: boolean;

  numberOfPages = 0;
  pageNumber = 0;

  private _stopScan = false;

  constructor(
    private _utilsService: UtilsService,
    private _dataService: DataService,
    private _steamService: SteamService
  ) {}

  ngDoCheck(): void {
    this.showNewPlayersBannedWarning =
      this.isOnGCPDSection &&
      this._dataService.newPlayersBanned &&
      !!this._dataService.database.hideHistoryTable;
  }

  startScan(type: 'new' | 'all') {
    const players =
      type === 'new'
        ? this.players.filter((p) => !p.banInfo?.LastFetch)
        : this.players;

    this.numberOfPages =
      Math.floor(players.length / 100) + (players.length % 100 !== 0 ? 1 : 0);

    this._scanPlayers(players);
  }

  stopScan() {
    this._stopScan = true;
  }

  private async _scanPlayers(players: PlayerInfo[]) {
    this._utilsService.isScanning = true;
    const startIndex = this.pageNumber * 100;
    const scannedPlayers = players.slice(startIndex, startIndex + 100);
    if (scannedPlayers.length) {
      const steamIds = scannedPlayers.map((p) => p.steamID64);
      try {
        const results = await this._steamService.scanPlayers(steamIds);
        this._handleDeletedProfiles(results, steamIds);

        this._dataService.parseSteamResults(results);

        this.error = '';
        if (this._stopScan) {
          this._stopScanning();
        } else {
          this.pageNumber++;
          if (this.pageNumber >= this.numberOfPages) {
            this._stopScanning();
          } else {
            setTimeout(() => this._scanPlayers(players), 500);
          }
        }
      } catch (e) {
        this.error = 'Error while trying to scan ban status of players';
        console.error(e);
        this._stopScanning();
      }
    } else {
      this._stopScanning();
    }
  }

  private _stopScanning() {
    this._utilsService.isScanning = this._stopScan = false;
    this.pageNumber = this.numberOfPages = 0;
    this._dataService.onSave.next();
  }

  /**
   * If steam API does not return the players, it is because steam profiles have been deleted
   * @param steamApiResults the results from steam API
   * @param steamIdsScanned the steam IDs we send
   */
  private _handleDeletedProfiles(
    steamApiResults: BanInfo[],
    steamIdsScanned: string[]
  ) {
    let allPlayers = this._dataService.database.players;
    const deletedPlayers = allPlayers.filter(
      (p) =>
        steamIdsScanned.includes(p.steamID64) &&
        !steamApiResults.some((r) => r.SteamId === p.steamID64)
    );
    for (const deleted of deletedPlayers) {
      const playerInfo = allPlayers.find(
        (p) => p.steamID64 === deleted.steamID64
      );
      if (playerInfo) {
        playerInfo.deleted = true;
      }
    }
  }
}
