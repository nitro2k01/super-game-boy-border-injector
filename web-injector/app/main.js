import { FileParser } from './gb-parser.js'
import { PaletteGB, PaletteSNES, ColorRGB15, Tile4BPP, MapSNES } from './console-graphics.js'
import { EXAMPLE_GB_TILE_DATA, EXAMPLE_GB_MAP_DATA, SGB_DEFAULT_PALETTE } from './preview-example-data.js'
import { ASSEMBLED_HOOK, ASSEMBLED_HOOK_BANK_NUMBER, ASSEMBLED_HOOK_ENTRY_POINT, ASSEMBLED_SGB_CODE } from './assembled-code.js'


/*
	Very preliminary JS implementation of Super Game Boy Injector
	by Marc Robledo 2024
	
	see https://github.com/marcrobledo/super-game-boy-border-injector
*/






var pickerStatus={
	'rom':false,
	'border-map':false,
	'border-tiles':false,
	'border-palettes':false,
	'custom-gb-palette':false
};
var bufferedFiles={};
var currentRomName;

function setPickerStatus(id, status, message){
	pickerStatus[id]=status;

	if(status){
		$('#picker-'+id).removeClass('picker-ko').addClass('picker-ok');
	}else{
		$('#picker-'+id).removeClass('picker-ok')
		if(id!=='custom-gb-palette')
			$('#picker-'+id).addClass('picker-ko');
	}
	$('#picker-message-'+id).html(message);
	
	refreshAside();
}




$(document).ready((evt) => {	
	/* UI events */
	$('#picker-rom').on('click', (evt) => {
		$('#input-file-rom').trigger('click');
	});
	$('#picker-border-map').on('click', (evt) => {
		$('#input-file-border-map').trigger('click');
	});
	$('#picker-border-tiles').on('click', (evt) => {
		$('#input-file-border-tiles').trigger('click');
	});
	$('#picker-border-palettes').on('click', (evt) => {
		$('#input-file-border-palettes').trigger('click');
	});

	$('#input-file-rom').on('change', function(evt) {
		if(this.files && this.files.length){
			var fr=new FileReader();
			fr.onload=function(evt){
				checkFileRom(new FileParser(this.result));
			};
			fr.readAsArrayBuffer(this.files[0]);
			currentRomName=this.files[0].name;
		}
	});
	$('#input-file-border-map').on('change', function(evt) {
		if(this.files && this.files.length){
			var fr=new FileReader();
			fr.onload=function(evt){
				var file=new FileParser(this.result);
				if(file.length()===10112){
					checkFileSGB(file);
				}else{
					checkFileBorderMap(file);
				}
			};	
			fr.readAsArrayBuffer(this.files[0]);
		}
	});
	$('#input-file-border-tiles').on('change', function(evt) {
		if(this.files && this.files.length){
			var fr=new FileReader();
			fr.onload=function(evt){
				var file=new FileParser(this.result);
				if(file.length()===10112){
					checkFileSGB(file);
				}else{
					checkFileBorderTiles(file);
				}
			};	
			fr.readAsArrayBuffer(this.files[0]);
		}
	});
	$('#input-file-border-palettes').on('change', function(evt) {
		if(this.files && this.files.length){
			var fr=new FileReader();
			fr.onload=function(evt){
				var file=new FileParser(this.result);
				if(file.length()===10112){
					checkFileSGB(file);
				}else{
					checkFileBorderPalettes(file);
				}
			};	
			fr.readAsArrayBuffer(this.files[0]);
		}
	});
	$('#picker-status-custom-gb-palette').on('click', function(evt) {
		var newValue=!pickerStatus['custom-gb-palette'];
		if(newValue){
			newValue=new PaletteGB(4);
			for(var i=0; i<4; i++){
				var components=RGB24toComponents($('#input-color'+i).val());
				newValue.colors[i]=new ColorRGB15(components.r, components.g, components.b);
			}
		}
		setPickerStatus('custom-gb-palette', newValue, null);
	});
	
	$('#input-color0, #input-color1, #input-color2, #input-color3').on('change', function(){
		if(pickerStatus['custom-gb-palette']){
			var colorIndex=parseInt(this.id.replace('input-color',''));
			var components=RGB24toComponents(this.value);
			pickerStatus['custom-gb-palette'].colors[colorIndex]=new ColorRGB15(components.r, components.g, components.b);
			refreshAside();
		}else{
			$('#picker-status-custom-gb-palette').trigger('click');
		}
	});

	$('#btn-build').on('click', buildROM);
});



function RGB24toComponents(rgb24){
	return{
		r:parseInt(rgb24.substr(1, 2), 16),
		g:parseInt(rgb24.substr(3, 2), 16),
		b:parseInt(rgb24.substr(5, 2), 16)
	}
}

function refreshAside(){
	var validBorder=pickerStatus['border-map'] && pickerStatus['border-tiles'] && pickerStatus['border-palettes'];
	var validRom=pickerStatus['rom'];
	var valid=validRom && validBorder;

	$('#btn-build').prop('disabled', !valid);
	if(validBorder){
		var map=pickerStatus['border-map'];
		var tiles=pickerStatus['border-tiles'];
		var palettes=pickerStatus['border-palettes'];
		var dmgPalette=pickerStatus['custom-gb-palette'] || SGB_DEFAULT_PALETTE;
		document.getElementById('canvas-preview').getContext('2d').putImageData(EXAMPLE_GB_MAP_DATA.toImageData(EXAMPLE_GB_TILE_DATA, [dmgPalette]), 48, 40);
		
		var tempCanvas=document.createElement('canvas');
		tempCanvas.width=256;
		tempCanvas.height=224;
		tempCanvas.getContext('2d').putImageData(map.toImageData(tiles, palettes, true), 0, 0);
		document.getElementById('canvas-preview').getContext('2d').drawImage(tempCanvas, 0, 0);
	}
}

const CARTRIDGE_TYPES=[
	{supported:false, id:0x00, mbc:0, title:'ROM (missing MBC)'},
	{supported:false, id:0x08, mbc:0, title:'ROM + RAM (missing MBC)'},
	{supported:false, id:0x09, mbc:0, title:'ROM + RAM + Battery (missing MBC)'},
	{supported:true, id:0x01, mbc:1, title:'MBC1'},
	{supported:true, id:0x02, mbc:1, title:'MBC1 + RAM'},
	{supported:true, id:0x03, mbc:1, title:'MBC1 + RAM + Battery'},
	{supported:true, id:0x05, mbc:2, title:'MBC2 + RAM'},
	{supported:true, id:0x06, mbc:2, title:'MBC2 + RAM + Battery'},
	{supported:false, id:0x0b, mbc:0, title:'MMM01 (unsupported)'},
	{supported:false, id:0x0c, mbc:0, title:'MMM01 + RAM (unsupported)'},
	{supported:false, id:0x0d, mbc:0, title:'MMM01 + RAM + Battery (unsupported)'},
	{supported:true, id:0x11, mbc:3, title:'MBC3'},
	{supported:true, id:0x12, mbc:3, title:'MBC3 + RAM'},
	{supported:true, id:0x13, mbc:3, title:'MBC3 + RAM + Battery'},
	{supported:true, id:0x0f, mbc:3, title:'MBC3 + Battery + RTC'},
	{supported:true, id:0x10, mbc:3, title:'MBC3 + RAM + Battery + RTC'},
	{supported:true, id:0x19, mbc:5, title:'MBC5'},
	{supported:true, id:0x1a, mbc:5, title:'MBC5 + RAM'},
	{supported:true, id:0x1b, mbc:5, title:'MBC5 + RAM + Battery'},
	{supported:true, id:0x1c, mbc:5, title:'MBC5 + Rumble'},
	{supported:true, id:0x1d, mbc:5, title:'MBC5 + RAM + Rumble'},
	{supported:true, id:0x1e, mbc:5, title:'MBC5 + RAM + Battery + Rumble'},
	{supported:true, id:0x22, mbc:7, title:'MBC7 + RAM + Battery + Gyro'},
	{supported:false, id:0xfc, mbc:0, title:'GB Camera + RAM + Battery (unsupported)'},
	{supported:false, id:0xff, mbc:0, title:'HuC1 + RAM + Battery (unsupported)'},
	{supported:false, id:0xfe, mbc:0, title:'HuC3 + RAM + Battery (unsupported)'}
];
/*
const CARTRIDGE_SIZES=[
	{supported:false, id:0x00, banks:2, title:'32KB'},
	{supported:true, id:0x01, banks:4, title:'64KB'},
	{supported:true, id:0x02, banks:8, title:'128KB'},
	{supported:true, id:0x03, banks:16, title:'256KB'},
	{supported:true, id:0x04, banks:32, title:'512KB'},
	{supported:true, id:0x05, banks:64, title:'1MB'},
	{supported:true, id:0x06, banks:128, title:'2MB'},
	{supported:true, id:0x07, banks:256, title:'4MB'},
	{supported:false, id:0x08, banks:512, title:'8MB'},
	{supported:false, id:0x52, banks:72, title:'1152KB'},
	{supported:false, id:0x53, banks:80, title:'1280KB'},
	{supported:false, id:0x54, banks:96, title:'1536KB'}
];
*/


function checkFileRom(file){
	var result={
		supported:false,
		title:'Invalid or incompatible Game Boy ROM',
		banks: nBanks
	}

	try{
		//check Nintendo header
		file.seek(0x0104);
		var headerXor=file.readBytes(48).reduce(function(acc, current){
			return acc ^ current;
		}, 0x00);
		if(headerXor!==0x86){
			throw new Error('Invalid Nintendo header');
		}

		//get cartridge type and size
		file.seek(0x0147);
		var byteType=file.readByte();
		var byteSize=file.readByte();
		
		var nBanks;
		if(byteSize<=8){
			nBanks=Math.pow(2, byteSize+1);
		}else if(byteSize%16384===0){
			nBanks=(byteSize+1)*2;
		}else{
			nBanks=0;
		}

		for(var i=0; i<CARTRIDGE_TYPES.length; i++){
			if(CARTRIDGE_TYPES[i].id===byteType){
				result.supported=CARTRIDGE_TYPES[i].supported;
				result.title=CARTRIDGE_TYPES[i].title;
				break;
			}
		}

		var message=result.title;
		if(!result.supported){
			throw new Error(message);
		}

		var fileSize=nBanks*16384;
		if((fileSize / 1048576) < 1)
			fileSize=(fileSize/1024)+'KB';
		else
			fileSize=(fileSize/1048576)+'MB';
		message+=' - '+fileSize+' ('+nBanks+' banks)';
		
		
		$('#picker-title-rom').html(currentRomName);

		setPickerStatus('rom', file, message);
	}catch(err){
		setPickerStatus('rom', false, err.message);
	}
}
function checkFileBorderMap(file){
	try{
		if(file.length()!==1792)
			throw new Error('invalid size (must be 1792 bytes)');

		/* import map */
		var map=MapSNES.import(file.toArray(), 32, 28);
		bufferedFiles.borderMap=file;

		setPickerStatus('border-map', map, 'Valid 32&times;28 tile map');
	}catch(err){
		setPickerStatus('border-map', false, 'Invalid file: '+err.message);
	}
}
function checkFileBorderTiles(file){
	try{
		if(file.length()%32!==0)
			throw new Error('invalid size (must be divisible by 32)');

		var nTiles=file.length()/32;
		if(nTiles>256)
			throw new Error('more than 256 tiles');

		/* import tiles */
		var tiles=new Array(file.length() / 32);
		for(var i=0; i<tiles.length; i++){
			tiles[i]=Tile4BPP.import(file.readBytes(32));
		}
		bufferedFiles.borderTiles=file;

		setPickerStatus('border-tiles', tiles, nTiles+' tiles');
	}catch(err){
		setPickerStatus('border-tiles', false, 'Invalid file: '+err.message);
	}
}
function checkFileBorderPalettes(file){
	try{
		if(file.length()%32!==0)
			throw new Error('invalid size (must be divisible by 32)');

		var nPalettes=file.length()/32;
		if(nPalettes>4)
			throw new Error('more than 4 palettes');

		/* import palettes */
		var palettes=new Array(file.length() / 32);
		for(var i=0; i<palettes.length; i++){
			palettes[i]=PaletteSNES.import(file.readWords(16));
		}
		bufferedFiles.borderPalettes=file;

		if(nPalettes===4)
			setPickerStatus('border-palettes', palettes, palettes.length+' palettes (might show up incorrectly in real hardware)');
		else
			setPickerStatus('border-palettes', palettes, palettes.length+' palettes');
	}catch(err){
		setPickerStatus('border-palettes', false, 'Invalid file: '+err.message);
	}
}
function checkFileSGB(file){
	checkFileBorderTiles(file.slice(0x0000, 256*32));
	checkFileBorderMap(file.slice(0x2000, 32*28*2));
	checkFileBorderPalettes(file.slice(0x2700, 16*2*4));
}



function checkRepeatBytes(file, offset, len){
	file.seek(offset);
	for(var i=0; i<len; i++){
		if(file.readByte()!==0xff)
			return false;
	}
	return offset;
}
function findRepeatBytes(file, offset, len, len2, reverse){
	for(var i=0; i<len; i++){
		var offset2;
		if(!reverse)
			offset2=offset+i;
		else
			offset2=offset-16-i;

		if(checkRepeatBytes(file, offset2, len2)){
			return offset2;
		}
	}
	return null;
}

// places the injector will look for free space
const VALID_BANK0_FREE_SPACE=[
	{offset:0x4000, len:0x80, reverse: true},
	{offset:0x0000, len:0xf0, reverse: false}
];



function buildROM(){
	var rom=pickerStatus['rom'];

	try{
		rom.seek(0x0101);
		if(rom.readByte()!==0xc3) //jp
			throw new Error('Game has no jp entry point');
		
		var freeSpace0=null;
		for(var i=0; i<VALID_BANK0_FREE_SPACE.length && freeSpace0===null; i++){
			freeSpace0=findRepeatBytes(rom, VALID_BANK0_FREE_SPACE[i].offset, VALID_BANK0_FREE_SPACE[i].len, 16, VALID_BANK0_FREE_SPACE[i].reverse);
		}
		if(freeSpace0===null)
			throw new Error('Bank 0 has no free space');

		console.log('free space found in bank 0: $'+freeSpace0.toString(16));
		var freeBankX=null;
		for(var i=0x4000; i<rom.length() && !freeBankX; i+=0x4000){
			if(checkRepeatBytes(rom, i, 0x4000)){
				freeBankX=i / 0x4000;
			}
		}

		if(freeBankX){
			console.log('free bank found $'+freeBankX.toString(16));
		}else{
			console.log('no free bank found, expanding ROM');
			freeBankX=rom.length() / 0x4000;
			
			var newRom=new FileParser(new Uint8Array(rom.length() * 2));
			rom.seek(0);
			for(var i=0; i<rom.length(); i++){
				newRom.writeByte(rom.readByte());
			}
			for(; i<newRom.length(); i++){
				newRom.writeByte(0xff);
			}


			rom=newRom;
			//fix ROM size in header
			var nBanks=rom.length() / 0x4000;
			rom.seek(0x0148);
			rom.writeByte(Math.log2(nBanks) - 1);
		}
		
		
		//add SGB flags to header
		rom.seek(0x0146);
		rom.writeByte(0x03);
		rom.seek(0x014b);
		rom.writeByte(0x33);

		//replace entry point
		rom.seek(0x0102);
		var originalEntryPoint=rom.readWord();
		rom.seek(0x0102);
		rom.writeWord(freeSpace0);

		//patch entry point hook
		rom.seek(freeSpace0);
		ASSEMBLED_HOOK[ASSEMBLED_HOOK_BANK_NUMBER]=freeBankX;
		ASSEMBLED_HOOK[ASSEMBLED_HOOK_ENTRY_POINT]=originalEntryPoint & 0xff;
		ASSEMBLED_HOOK[ASSEMBLED_HOOK_ENTRY_POINT + 1]=(originalEntryPoint >> 8) & 0xff;
		rom.writeBytes(ASSEMBLED_HOOK);

		//write SGB code
		rom.seek(freeBankX * 0x4000);
		rom.writeBytes(ASSEMBLED_SGB_CODE);
		
		//disable custom GB palette by nopping call sgb_packet_transfer
		if(!pickerStatus['custom-gb-palette']){
			rom.seek(freeBankX * 0x4000 + (0x4066 - 0x4000));
			rom.writeBytes([0x00, 0x00, 0x00]); //three nops
		}

		//write data: border map+palettes
		rom.seek(freeBankX * 0x4000 + (0x5300 - 0x4000));
		rom.writeBytes(bufferedFiles.borderMap.toArray());
		for(var i=0; i<32*2*4; i++){
			rom.writeByte(0x00); //rows 28-31
		}
		rom.writeBytes(bufferedFiles.borderPalettes.toArray());

		//write data: border tileset
		rom.seek(freeBankX * 0x4000 + (0x5c00 - 0x4000));
		rom.writeBytes(bufferedFiles.borderTiles.toArray());

		//write data: game screen palettes
		rom.seek(freeBankX * 0x4000 + (0x7c00 - 0x4000));
		rom.writeWords((pickerStatus['custom-gb-palette'] || SGB_DEFAULT_PALETTE).export());

		// calculate and fix checksums
		var newChecksum=0x00;
		rom.seek(0x0134);
		for(var i=0; i<=0x18; i++){
			newChecksum=((newChecksum - rom.readByte() - 1) >>> 0) & 0xff;
		}
		rom.seek(0x014d);
		rom.writeByte(newChecksum);

		rom.seek(0x0000);
		newChecksum=0x0000;
		for(var i=0; i<0x014e; i++){
			newChecksum=(newChecksum + rom.readByte()) & 0xffff;
		}
		rom.readWord();
		while(!rom.isEOF()){
			newChecksum=(newChecksum + rom.readByte()) & 0xffff;
		}
		rom.seek(0x014e);
		rom.writeByte((newChecksum >> 8) & 0xff);
		rom.writeByte(newChecksum & 0xff);


		var newRomName=currentRomName.replace(/\.(gbc?)$/, ' (SGB Compatible).$1');
		var blob=new Blob([rom.getBuffer()], {type: 'application/octet-stream'});
		saveAs(blob, newRomName);



	}catch(err){
		setPickerStatus('rom', false, 'Incompatible ROM: '+err.message);
	}
}